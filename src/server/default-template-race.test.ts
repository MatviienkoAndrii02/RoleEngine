import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { withWorkspaceDefaultTemplateLock } from "@/server/actions/templates";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("default template invariant", () => {
  afterEach(async () => {
    if (createdWorkspaceIds.length) {
      await prisma.auditLog.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.entityTemplate.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }

    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("serializes default template promotion under concurrent creates", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: {
        email: `default-race-${unique}@example.com`,
        username: `default_race_${unique}`,
        usernameKey: `default_race_${unique}`,
      },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Default Race ${unique}` } });
    createdWorkspaceIds.push(workspace.id);

    await prisma.workspaceMembership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });

    const concurrentCreates = await Promise.all([
      withWorkspaceDefaultTemplateLock(workspace.id, async (tx) => {
        const existing = await tx.entityTemplate.count({ where: { workspaceId: workspace.id, isDefaultCharacter: true } });
        if (existing > 0) return null;
        return tx.entityTemplate.create({
          data: {
            workspaceId: workspace.id,
            kind: "CHARACTER",
            name: "Concurrent Default 1",
            isDefaultCharacter: true,
            createdById: user.id,
          },
        });
      }),
      withWorkspaceDefaultTemplateLock(workspace.id, async (tx) => {
        const existing = await tx.entityTemplate.count({ where: { workspaceId: workspace.id, isDefaultCharacter: true } });
        if (existing > 0) return null;
        return tx.entityTemplate.create({
          data: {
            workspaceId: workspace.id,
            kind: "CHARACTER",
            name: "Concurrent Default 2",
            isDefaultCharacter: true,
            createdById: user.id,
          },
        });
      }),
    ]);

    const created = concurrentCreates.filter(Boolean);
    assert.equal(created.length, 1);
    const defaults = await prisma.entityTemplate.count({ where: { workspaceId: workspace.id, isDefaultCharacter: true } });
    assert.equal(defaults, 1);
  });
});
