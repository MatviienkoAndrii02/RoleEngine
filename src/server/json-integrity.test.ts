import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/server/errors";
import {
  applyJsonIntegrityPolicy,
  getJsonIntegrityReport,
  resolveJsonIntegrityEntry,
  scanWorkspaceJsonIntegrity,
} from "@/server/json-integrity";

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

describe("json integrity policy", () => {
  afterEach(async () => {
    for (const workspaceId of createdWorkspaceIds) {
      const characters = await prisma.character.findMany({ where: { workspaceId }, select: { id: true } });
      const characterIds = characters.map((character) => character.id);
      await prisma.jsonIntegrityQuarantine.deleteMany({ where: { OR: [{ workspaceId }, { characterId: { in: characterIds } }] } });
      await prisma.auditLog.deleteMany({ where: { characterId: { in: characterIds } } });
      await prisma.dependencyEdge.deleteMany({ where: { characterId: { in: characterIds } } });
      await prisma.effect.deleteMany({ where: { characterId: { in: characterIds } } });
      await prisma.characterNode.deleteMany({ where: { characterId: { in: characterIds } } });
      await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    createdWorkspaceIds.length = 0;

    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  it("quarantines, repairs and releases persisted JSON findings idempotently", async () => {
    const unique = Date.now().toString(36);
    const user = await prisma.user.create({
      data: { email: `integrity-${unique}@example.com`, username: `integrity_${unique}`, usernameKey: `integrity_${unique}` },
    });
    createdUserIds.push(user.id);

    const workspace = await prisma.workspace.create({ data: { name: `Integrity ${unique}`, ownerId: user.id } });
    createdWorkspaceIds.push(workspace.id);
    await prisma.workspaceMembership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });

    const character = await prisma.character.create({
      data: { workspaceId: workspace.id, name: "Integrity Character", createdById: user.id, metadata: ["broken"] },
    });
    const repairableNode = await prisma.characterNode.create({
      data: { characterId: character.id, type: "NUMBER", name: "Strength", path: "strength", slug: "strength", data: { value: "10", legacy: true } },
    });
    const manualNode = await prisma.characterNode.create({
      data: { characterId: character.id, type: "LINK", name: "Broken link", path: "broken-link", slug: "broken-link", data: { targetKind: "wat" } },
    });
    const computedNode = await prisma.characterNode.create({
      data: { characterId: character.id, type: "TEXT", name: "Notes", path: "notes", slug: "notes", data: { text: "ok" }, computed: ["broken"] },
    });
    await prisma.effect.create({
      data: {
        characterId: character.id,
        name: "Broken effect",
        operation: "ADD",
        condition: { kind: "wat" },
        target: { kind: "node", nodeId: repairableNode.id },
        source: { kind: "number", value: 1 },
      },
    });
    await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        characterId: character.id,
        entityType: "Character",
        entityId: character.id,
        action: "CREATE",
        metadata: ["broken"],
      },
    });

    const scope = { kind: "character", characterId: character.id } as const;

    const report = await getJsonIntegrityReport(scope);
    assert.equal(report.workspaceId, workspace.id);
    assert.equal(report.summary.invalid, 6);
    assert.equal(report.summary.repairable, 2);
    assert.equal(report.summary.manual, 4);
    assert.equal(report.summary.activeQuarantine, 0);
    assert.ok(report.entries.some((entry) => entry.entityType === "AuditLog" && !entry.repairable));

    const quarantined = await applyJsonIntegrityPolicy(scope, user.id, "quarantine");
    assert.equal(quarantined.repaired, 0);
    assert.equal(quarantined.quarantined, 6);

    const rows = await prisma.jsonIntegrityQuarantine.findMany({ where: { characterId: character.id } });
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.status === "ACTIVE"));

    // Re-running the policy must not duplicate registry rows.
    await applyJsonIntegrityPolicy(scope, user.id, "quarantine");
    assert.equal(await prisma.jsonIntegrityQuarantine.count({ where: { characterId: character.id } }), 6);

    const nodeRow = await prisma.jsonIntegrityQuarantine.findUniqueOrThrow({
      where: { entityType_entityId_field: { entityType: "CharacterNode", entityId: repairableNode.id, field: "data" } },
    });
    await resolveJsonIntegrityEntry({ entryId: nodeRow.id, resolution: "repair" }, user.id);

    const fixedNode = await prisma.characterNode.findUniqueOrThrow({ where: { id: repairableNode.id } });
    assert.deepEqual(fixedNode.data, { value: 10 });
    const repairedRow = await prisma.jsonIntegrityQuarantine.findUniqueOrThrow({ where: { id: nodeRow.id } });
    assert.equal(repairedRow.status, "REPAIRED");
    assert.deepEqual(
      (Array.isArray(repairedRow.repairs) ? repairedRow.repairs : []).map(String).sort(),
      ["COERCED_NUMBER", "DROPPED_UNKNOWN_PROPERTY"],
    );
    assert.ok(repairedRow.resolvedAt);
    assert.equal(
      await prisma.auditLog.count({ where: { characterId: character.id, entityId: repairableNode.id, fieldPath: "data" } }),
      1,
    );

    const auditRow = await prisma.jsonIntegrityQuarantine.findFirstOrThrow({ where: { characterId: character.id, entityType: "AuditLog" } });
    await resolveJsonIntegrityEntry({ entryId: auditRow.id, resolution: "release" }, user.id);
    assert.equal((await prisma.jsonIntegrityQuarantine.findUniqueOrThrow({ where: { id: auditRow.id } })).status, "RELEASED");

    await assert.rejects(
      () => resolveJsonIntegrityEntry({ entryId: auditRow.id, resolution: "repair" }, user.id),
      (error: unknown) => error instanceof AppError && error.code === "JSON_INTEGRITY_REPAIR_FAILED" && error.status === 409,
    );
    await assert.rejects(
      () => resolveJsonIntegrityEntry({ entryId: "missing_entry", resolution: "release" }, user.id),
      (error: unknown) => error instanceof AppError && error.code === "JSON_INTEGRITY_ENTRY_NOT_FOUND" && error.status === 404,
    );

    const repaired = await applyJsonIntegrityPolicy(scope, user.id, "repair");
    assert.equal(repaired.repaired, 1);
    assert.equal(repaired.quarantined, 4);

    const fixedCharacter = await prisma.character.findUniqueOrThrow({ where: { id: character.id } });
    assert.deepEqual(fixedCharacter.metadata, {});
    assert.deepEqual((await prisma.characterNode.findUniqueOrThrow({ where: { id: manualNode.id } })).data, { targetKind: "wat" });
    assert.deepEqual((await prisma.characterNode.findUniqueOrThrow({ where: { id: computedNode.id } })).computed, ["broken"]);
    // A released finding stays released until the underlying JSON changes.
    assert.equal((await prisma.jsonIntegrityQuarantine.findUniqueOrThrow({ where: { id: auditRow.id } })).status, "RELEASED");

    const afterRepair = await getJsonIntegrityReport(scope);
    assert.equal(afterRepair.summary.invalid, 4);
    assert.equal(afterRepair.summary.repairable, 0);
    assert.equal(afterRepair.summary.activeQuarantine, 3);

    await assert.rejects(
      () => resolveJsonIntegrityEntry({ entryId: (rows.find((row) => row.entityId === manualNode.id) ?? auditRow).id, resolution: "repair" }, user.id),
      (error: unknown) => error instanceof AppError && error.code === "JSON_INTEGRITY_REPAIR_FAILED",
    );

    const dryRun = await scanWorkspaceJsonIntegrity({ workspaceId: workspace.id, actorId: user.id });
    assert.equal(dryRun.length, 1);
    assert.equal(dryRun[0]?.scopeKind, "character");
    assert.equal(dryRun[0]?.entries.length, 4);

    const applied = await scanWorkspaceJsonIntegrity({ workspaceId: workspace.id, actorId: user.id, apply: true });
    assert.equal(applied.length, 1);
    assert.equal(applied[0]?.repaired, 0);
    assert.equal(applied[0]?.quarantined, 4);
    assert.equal(await prisma.jsonIntegrityQuarantine.count({ where: { characterId: character.id } }), 6);
  });
});
