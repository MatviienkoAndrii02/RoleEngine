import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { updateCharacterNode } from "@/server/actions/characters";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("character node mutation atomicity", () => {
  afterEach(async () => {
    if (createdWorkspaceIds.length) {
      await prisma.auditLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.dependencyEdge.deleteMany({ where: { character: { workspaceId: { in: createdWorkspaceIds } } } });
      await prisma.effect.deleteMany({ where: { character: { workspaceId: { in: createdWorkspaceIds } } } });
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

  it("persists node update, audit and rebuilt dependency graph in one transaction", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `atomic-${unique}@example.com`,
        username: `atomic_${unique}`,
        usernameKey: `atomic_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Atomic ${unique}` } });
    createdWorkspaceIds.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });

    const character = await prisma.character.create({
      data: { workspaceId: workspace.id, name: "Atomic Character", createdById: user.id },
    });

    const sourceNode = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Base power",
        slug: "base-power",
        path: "base-power",
        order: 0,
        data: { value: 10 },
      },
    });

    const targetNode = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Power",
        slug: "power",
        path: "power",
        order: 1,
        data: { value: 0 },
      },
    });

    await prisma.effect.create({
      data: {
        name: "Power bonus",
        enabled: true,
        operation: "ADD",
        priority: 0,
        characterId: character.id,
        condition: { kind: "always" },
        target: { kind: "node", nodeId: targetNode.id },
        source: { kind: "node", nodeId: sourceNode.id },
        payload: {},
      },
    });

    const updated = await updateCharacterNode(
      { characterId: character.id, nodeId: sourceNode.id, name: "Renamed Base", data: { value: 15 } },
      { user: { id: user.id } },
    );

    assert.equal(updated.name, "Renamed Base");

    const node = await prisma.characterNode.findUniqueOrThrow({ where: { id: sourceNode.id } });
    assert.equal(node.name, "Renamed Base");
    assert.deepEqual(node.data, { value: 15 });

    // Derived state was rebuilt in the same transaction.
    const edges = await prisma.dependencyEdge.findMany({ where: { characterId: character.id } });
    assert.equal(edges.length, 1);
    assert.equal(edges[0].sourceNodeId, sourceNode.id);
    assert.equal(edges[0].targetNodeId, targetNode.id);

    // Audit row exists for the mutation.
    const audits = await prisma.auditLog.findMany({
      where: { workspaceId: workspace.id, entityType: "CharacterNode", entityId: sourceNode.id, action: "UPDATE" },
    });
    assert.equal(audits.length, 1);
    const oldValue = audits[0].oldValue as { name?: string } | null;
    assert.equal(oldValue?.name, "Base power");
  });

  it("rejects moving a node into its own subtree without persisting anything", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `cycle-${unique}@example.com`,
        username: `cycle_${unique}`,
        usernameKey: `cycle_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Cycle ${unique}` } });
    createdWorkspaceIds.push(workspace.id);
    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });

    const character = await prisma.character.create({
      data: { workspaceId: workspace.id, name: "Cycle Character", createdById: user.id },
    });

    const parent = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "GROUP",
        name: "Parent",
        slug: "parent",
        path: "parent",
        order: 0,
        data: {},
      },
    });

    const child = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Child",
        slug: "child",
        path: "parent/child",
        parentId: parent.id,
        order: 0,
        data: { value: 1 },
      },
    });

    await assert.rejects(
      async () => {
        await updateCharacterNode(
          { characterId: character.id, nodeId: parent.id, parentId: child.id },
          { user: { id: user.id } },
        );
      },
      /inside itself/i,
    );

    const unchanged = await prisma.characterNode.findUniqueOrThrow({ where: { id: parent.id } });
    assert.equal(unchanged.parentId, null);
    const audits = await prisma.auditLog.findMany({ where: { workspaceId: workspace.id, entityType: "CharacterNode" } });
    assert.equal(audits.length, 0);
  });
});
