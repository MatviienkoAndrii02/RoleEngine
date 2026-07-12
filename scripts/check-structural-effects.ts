import { PrismaClient } from "@prisma/client";
import { reconcileStructuralEffects } from "@/server/structural-effects";

const prisma = new PrismaClient();
const characterId = "structural-integration-check";

async function main() {
  const actor = await prisma.user.upsert({
    where: { email: "structural-check@role.local" },
    update: { name: "Structural Check", username: "structural_check", usernameKey: "structural_check" },
    create: { email: "structural-check@role.local", username: "structural_check", usernameKey: "structural_check", name: "Structural Check" },
  });
  const workspace = await prisma.workspace.upsert({
    where: { id: "structural-integration-workspace" },
    update: { ownerId: actor.id },
    create: { id: "structural-integration-workspace", name: "Structural integration check", ownerId: actor.id },
  });
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.id } },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: actor.id, role: "OWNER" },
  });
  await prisma.character.deleteMany({ where: { id: characterId } });
  await prisma.character.create({ data: { id: characterId, workspaceId: workspace.id, name: "Structural check", createdById: actor.id } });
  const container = await prisma.characterNode.create({ data: { characterId, type: "CONTAINER", name: "Root", path: "root", slug: "root", data: {} } });
  const effect = await prisma.effect.create({ data: { characterId, name: "Create child", operation: "CREATE_NODE", condition: { kind: "always" }, target: { kind: "node", nodeId: container.id }, source: { kind: "number", value: 0 }, payload: { createNode: { type: "TEXT", name: "Generated", data: { text: "" } } } } });

  await reconcileStructuralEffects(characterId);
  await reconcileStructuralEffects(characterId);
  const generated = await prisma.characterNode.findMany({ where: { characterId, computed: { path: ["generatedByEffectId"], equals: effect.id } } });
  if (generated.length !== 1) throw new Error(`Expected one generated node, received ${generated.length}`);

  await prisma.effect.update({ where: { id: effect.id }, data: { enabled: false } });
  await reconcileStructuralEffects(characterId);
  const archived = await prisma.characterNode.count({ where: { characterId, id: generated[0].id, archivedAt: { not: null } } });
  if (archived !== 1) throw new Error("Generated node was not archived after disabling the effect");

  const parentEffect = await prisma.effect.create({ data: { characterId, name: "Create group", operation: "CREATE_GROUP", priority: 1, condition: { kind: "always" }, target: { kind: "node", nodeId: container.id }, source: { kind: "number", value: 0 }, payload: { createNode: { type: "GROUP", name: "Generated group", data: {} } } } });
  await reconcileStructuralEffects(characterId);
  const group = await prisma.characterNode.findFirstOrThrow({ where: { characterId, computed: { path: ["generatedByEffectId"], equals: parentEffect.id } } });
  const childEffect = await prisma.effect.create({ data: { characterId, name: "Create number in group", operation: "CREATE_NODE", priority: 2, condition: { kind: "always" }, target: { kind: "node", nodeId: group.id }, source: { kind: "number", value: 0 }, payload: { createNode: { type: "NUMBER", name: "Generated number", data: { value: 7 } } } } });
  await reconcileStructuralEffects(characterId);
  const child = await prisma.characterNode.findFirstOrThrow({ where: { characterId, computed: { path: ["generatedByEffectId"], equals: childEffect.id } } });
  if (child.type !== "NUMBER") throw new Error(`Expected NUMBER before restore, received ${child.type}`);

  await prisma.effect.update({ where: { id: parentEffect.id }, data: { enabled: false } });
  await reconcileStructuralEffects(characterId);
  const archivedChild = await prisma.characterNode.findUniqueOrThrow({ where: { id: child.id } });
  if (!archivedChild.archivedAt) throw new Error("Dependent generated node stayed active without its parent");

  await prisma.effect.update({ where: { id: parentEffect.id }, data: { enabled: true } });
  await reconcileStructuralEffects(characterId);
  const restoredChild = await prisma.characterNode.findUniqueOrThrow({ where: { id: child.id } });
  if (restoredChild.archivedAt) throw new Error("Dependent generated node was not restored");
  if (restoredChild.type !== "NUMBER") throw new Error(`Expected NUMBER after restore, received ${restoredChild.type}`);

  const rootEffect = await prisma.effect.create({ data: { characterId, name: "Create at root", operation: "CREATE_GROUP", priority: 3, condition: { kind: "always" }, target: { kind: "root" }, source: { kind: "number", value: 0 }, payload: { createNode: { type: "GROUP", name: "Root generated group", data: {} } } } });
  await reconcileStructuralEffects(characterId);
  const rootGenerated = await prisma.characterNode.findFirstOrThrow({ where: { characterId, computed: { path: ["generatedByEffectId"], equals: rootEffect.id } } });
  if (rootGenerated.parentId !== null) throw new Error("Root structural effect created a nested node");
  await prisma.effect.update({ where: { id: rootEffect.id }, data: { target: { kind: "node", nodeId: container.id }, payload: { createNode: { type: "GROUP", name: "Moved generated group", data: { color: "blue" } } } } });
  await reconcileStructuralEffects(characterId);
  const movedGenerated = await prisma.characterNode.findUniqueOrThrow({ where: { id: rootGenerated.id } });
  if (movedGenerated.parentId !== container.id || movedGenerated.name !== "Moved generated group" || movedGenerated.type !== "GROUP") throw new Error("Editing a structural effect did not synchronize its generated root");
  console.log("structural reconciliation: passed");
}

main().finally(async () => {
  await prisma.character.deleteMany({ where: { id: characterId } });
  await prisma.workspace.deleteMany({ where: { id: "structural-integration-workspace" } });
  await prisma.$disconnect();
});
