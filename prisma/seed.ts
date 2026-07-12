import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 12);
  const gm = await prisma.user.upsert({
    where: { email: "gm@role.local" },
    update: { name: "Demo Game Master", username: "gm", usernameKey: "gm", passwordHash },
    create: { email: "gm@role.local", username: "gm", usernameKey: "gm", name: "Demo Game Master", passwordHash }
  });
  const player = await prisma.user.upsert({
    where: { email: "player@role.local" },
    update: { name: "Demo Player", username: "player", usernameKey: "player", passwordHash },
    create: { email: "player@role.local", username: "player", usernameKey: "player", name: "Demo Player", passwordHash }
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "legacy-workspace" },
    update: { name: "Legacy Workspace", ownerId: gm.id },
    create: { id: "legacy-workspace", name: "Legacy Workspace", ownerId: gm.id, metadata: { legacy: true } }
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: gm.id } },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: gm.id, role: "OWNER" }
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: player.id } },
    update: { role: "PLAYER" },
    create: { workspaceId: workspace.id, userId: player.id, role: "PLAYER" }
  });

  const template = await prisma.entityTemplate.upsert({
    where: { id: "global-default-character" },
    update: {
      workspaceId: workspace.id,
      name: "Standard Character",
      isGlobal: false,
      isDefaultCharacter: true
    },
    create: {
      id: "global-default-character",
      workspaceId: workspace.id,
      kind: "CHARACTER",
      name: "Standard Character",
      description: "Human baseline, basic stats, empty inventory.",
      isGlobal: false,
      isDefaultCharacter: true
    }
  });

  await prisma.templateNode.deleteMany({ where: { templateId: template.id } });

  const identity = await prisma.templateNode.create({
    data: {
      templateId: template.id,
      type: "GROUP",
      name: "Identity",
      slug: "identity",
      path: "identity",
      order: 0,
      data: { color: "teal" }
    }
  });

  await prisma.templateNode.create({
    data: {
      templateId: template.id,
      parentId: identity.id,
      type: "TEXT",
      name: "Race",
      slug: "race",
      path: "identity/race",
      order: 0,
      data: { text: "Human" }
    }
  });

  const stats = await prisma.templateNode.create({
    data: {
      templateId: template.id,
      type: "GROUP",
      name: "Stats",
      slug: "stats",
      path: "stats",
      order: 1,
      data: { color: "amber" }
    }
  });

  for (const [order, name] of ["Strength", "Intelligence", "Agility"].entries()) {
    await prisma.templateNode.create({
      data: {
        templateId: template.id,
        parentId: stats.id,
        type: "NUMBER",
        name,
        slug: name.toLowerCase(),
        path: `stats/${name.toLowerCase()}`,
        order,
        data: { value: 10, min: 0, max: null, allowNegative: false }
      }
    });
  }

  await prisma.templateNode.create({
    data: {
      templateId: template.id,
      type: "CONTAINER",
      name: "Inventory",
      slug: "inventory",
      path: "inventory",
      order: 2,
      data: { collapsedByDefault: false }
    }
  });

  const character = await prisma.character.upsert({
    where: { id: "demo-character" },
    update: {
      workspaceId: workspace.id,
      name: "Mira Vale",
      description: "Demo character assigned to the player account.",
      ownerId: player.id,
      createdById: gm.id,
      archivedAt: null
    },
    create: {
      id: "demo-character",
      workspaceId: workspace.id,
      name: "Mira Vale",
      description: "Demo character assigned to the player account.",
      ownerId: player.id,
      createdById: gm.id
    }
  });

  await prisma.characterAssignment.upsert({
    where: { characterId_userId: { characterId: character.id, userId: player.id } },
    update: { canView: true },
    create: { characterId: character.id, userId: player.id, canView: true }
  });

  await prisma.characterNode.deleteMany({ where: { characterId: character.id } });
  const characterStats = await prisma.characterNode.create({
    data: {
      characterId: character.id,
      type: "GROUP",
      name: "Stats",
      slug: "stats",
      path: "stats",
      order: 0,
      data: { color: "amber" }
    }
  });

  const demoStats: Array<[string, number]> = [["Strength", 12], ["Intelligence", 14], ["Agility", 11]];
  for (const [order, [name, value]] of demoStats.entries()) {
    await prisma.characterNode.create({
      data: {
        characterId: character.id,
        parentId: characterStats.id,
        type: "NUMBER",
        name,
        slug: name.toLowerCase(),
        path: `stats/${name.toLowerCase()}`,
        order,
        data: { value, min: 0, max: null, allowNegative: false }
      }
    });
  }

  await prisma.auditLog.deleteMany({ where: { characterId: character.id, metadata: { path: ["seed"], equals: true } } });
  await prisma.auditLog.create({
    data: {
        actorId: gm.id,
        workspaceId: workspace.id,
        characterId: character.id,
      entityType: "Character",
      entityId: character.id,
      action: "CREATE",
      newValue: { name: character.name },
      metadata: { seed: true }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
