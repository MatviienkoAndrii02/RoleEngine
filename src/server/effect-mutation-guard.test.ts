import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { withEffectMutationRollback } from "@/server/actions/effects";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("effect mutation rollback guard", () => {
  afterEach(async () => {
    if (createdWorkspaceIds.length) {
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

  it("reverts the effect and rebuilds graph state after a downstream failure", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `rollback-${unique}@example.com`,
        username: `rollback_${unique}`,
        usernameKey: `rollback_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Rollback ${unique}` } });
    createdWorkspaceIds.push(workspace.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspace.id,
        name: "Rollback Character",
        createdById: user.id,
      },
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

    const effect = await prisma.effect.create({
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

    const alternateSourceNode = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Alternate source",
        slug: "alternate-source",
        path: "alternate-source",
        order: 2,
        data: { value: 42 },
      },
    });

    await assert.rejects(async () => {
      await withEffectMutationRollback(character.id, effect.id, async () => {
        await prisma.effect.update({
          where: { id: effect.id },
          data: { source: { kind: "node", nodeId: alternateSourceNode.id } },
        });
        throw new Error("downstream sync failed");
      });
    }, /downstream sync failed/);

    const current = await prisma.effect.findUniqueOrThrow({ where: { id: effect.id } });
    const source = current.source as { kind?: string; nodeId?: string } | null;
    assert.ok(source && source.kind === "node");
    assert.equal(source?.nodeId, sourceNode.id);

    const edges = await prisma.dependencyEdge.findMany({ where: { characterId: character.id } });
    assert.equal(edges.length, 1);
    assert.equal(edges[0].sourceNodeId, sourceNode.id);
    assert.equal(edges[0].targetNodeId, targetNode.id);
  });

  it("reverts the effect when audit persistence fails during an update", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `audit-rollback-${unique}@example.com`,
        username: `audit_rollback_${unique}`,
        usernameKey: `audit_rollback_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Audit Rollback ${unique}` } });
    createdWorkspaceIds.push(workspace.id);
    await prisma.workspaceMembership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });

    const character = await prisma.character.create({
      data: {
        workspaceId: workspace.id,
        name: "Audit Character",
        createdById: user.id,
      },
    });

    const sourceNode = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Source",
        slug: "source",
        path: "source",
        order: 0,
        data: { value: 10 },
      },
    });

    const targetNode = await prisma.characterNode.create({
      data: {
        characterId: character.id,
        type: "NUMBER",
        name: "Target",
        slug: "target",
        path: "target",
        order: 1,
        data: { value: 0 },
      },
    });

    const effect = await prisma.effect.create({
      data: {
        name: "Audit guard",
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

    await assert.rejects(
      async () => {
        await withEffectMutationRollback(character.id, effect.id, async () => {
          await prisma.effect.update({
            where: { id: effect.id },
            data: {
              name: "Audit guard renamed",
              target: { kind: "node", nodeId: targetNode.id },
              source: { kind: "node", nodeId: sourceNode.id },
            },
          });
          throw new Error("audit failed");
        });
      },
      /audit failed/,
    );

    const current = await prisma.effect.findUniqueOrThrow({ where: { id: effect.id } });
    const source = current.source as { kind?: string; nodeId?: string } | null;
    const target = current.target as { kind?: string; nodeId?: string } | null;
    assert.equal(current.name, "Audit guard");
    assert.ok(source && source.kind === "node");
    assert.equal(source?.nodeId, sourceNode.id);
    assert.ok(target && target.kind === "node");
    assert.equal(target?.nodeId, targetNode.id);
  });
});
