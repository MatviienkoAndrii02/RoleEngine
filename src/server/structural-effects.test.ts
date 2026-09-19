import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { reconcileStructuralEffects } from "@/server/structural-effects";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("structural effects reconciliation", () => {
  afterEach(async () => {
    if (createdWorkspaceIds.length) {
      await prisma.effect.deleteMany({ where: { character: { workspaceId: { in: createdWorkspaceIds } } } });
      await prisma.characterAssignment.deleteMany({ where: { character: { workspaceId: { in: createdWorkspaceIds } } } });
      await prisma.characterNode.deleteMany({ where: { characterId: { in: (await prisma.character.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })).map((character) => character.id) } } });
      await prisma.character.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }

    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("stays idempotent and archives/restores generated nodes when the effect is toggled", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `reconcile-${unique}@example.com`,
        username: `reconcile_${unique}`,
        usernameKey: `reconcile_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Structural Reconcile ${unique}` } });
    createdWorkspaceIds.push(workspace.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspace.id,
        name: "Reconcile Character",
        createdById: user.id,
      },
    });

    const effect = await prisma.effect.create({
      data: {
        name: "Create pouch",
        enabled: true,
        operation: "CREATE_NODE",
        priority: 0,
        characterId: character.id,
        condition: { kind: "always" },
        target: { kind: "root" },
        source: { kind: "number", value: 0 },
        payload: {
          createNode: {
            type: "CONTAINER",
            name: "Pouch",
            data: { collapsedByDefault: false },
          },
        },
      },
    });

    await reconcileStructuralEffects(character.id);
    await reconcileStructuralEffects(character.id);

    const activePouches = await prisma.characterNode.findMany({
      where: { characterId: character.id, name: "Pouch", archivedAt: null },
    });
    assert.equal(activePouches.length, 1);

    await prisma.effect.update({
      where: { id: effect.id },
      data: { enabled: false },
    });
    await reconcileStructuralEffects(character.id);

    const archivedPouches = await prisma.characterNode.findMany({
      where: { characterId: character.id, name: "Pouch", archivedAt: { not: null } },
    });
    assert.equal(archivedPouches.length, 1);

    await prisma.effect.update({
      where: { id: effect.id },
      data: { enabled: true },
    });
    await reconcileStructuralEffects(character.id);

    const restoredPouches = await prisma.characterNode.findMany({
      where: { characterId: character.id, name: "Pouch", archivedAt: null },
    });
    assert.equal(restoredPouches.length, 1);
  });
});
