import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminBackupRecord, AdminBackupRestoreResult } from "@/domain/admin-console";
import { deleteAdminBackupRoute } from "@/app/admin-api/backups/[backupId]/backup-item-route-handlers";
import { downloadAdminBackupRoute } from "@/app/admin-api/backups/[backupId]/download/download-route-handlers";
import * as restoreRoute from "@/app/admin-api/backups/[backupId]/restore/route";
import { restoreAdminBackupRoute } from "@/app/admin-api/backups/[backupId]/restore/restore-route-handlers";
import { createAdminBackupRoute, listAdminBackupsRoute } from "@/app/admin-api/backups/backup-route-handlers";
import { adminHealthRoute } from "@/app/admin-api/health/health-route-handlers";
import { adminOverviewRoute } from "@/app/admin-api/overview/overview-route-handlers";
import type { AdminActor } from "@/server/admin/authz";
import { appError, forbidden } from "@/server/errors";

const actor: AdminActor = { id: "user_admin", email: "admin@example.com" };
const allow = async () => actor;
const deny = async (): Promise<AdminActor> => {
  throw forbidden();
};

const backupRecord: AdminBackupRecord = {
  id: "backup-20260921t020000z-abcd1234",
  fileName: "backup-20260921t020000z-abcd1234.dump",
  createdAt: "2026-09-21T02:00:00.000Z",
  sizeBytes: 4096,
  status: "COMPLETED",
  appVersion: null,
  appCommit: null,
  schemaMigration: null,
  createdById: actor.id,
  message: null,
};

const restoreResult: AdminBackupRestoreResult = {
  backupId: backupRecord.id,
  backupFileName: backupRecord.fileName,
  restoredAt: "2026-09-21T02:05:00.000Z",
  durationMs: 1_500,
  archiveEntries: 128,
  safetyBackup: {
    ...backupRecord,
    id: "pre-restore-2026-09-21-02-05-00",
    fileName: "pre-restore-2026-09-21-02-05-00.dump",
  },
  previousSchemaMigration: "20260101000000_init",
  restoredSchemaMigration: "20260101000000_init",
  schemaChanged: false,
};

const healthSnapshot = {
  application: { status: "UP" as const, startedAt: "2026-09-21T01:00:00.000Z", uptimeSeconds: 600, nodeVersion: "v24.0.0", version: null, commit: null },
  database: { status: "UP" as const, latencyMs: 3, message: null },
  cpu: { usagePercent: 12.5, cores: 8, loadAverage: null },
  memory: { totalBytes: 1024, usedBytes: 512, usagePercent: 50 },
  disk: null,
  backupTool: { available: true, version: "pg_dump (PostgreSQL) 18.4", path: "pg_dump", message: null },
};

const backupDependencies = {
  requirePlatformAdmin: allow,
  listBackups: async () => [backupRecord],
  createBackup: async () => backupRecord,
  describeBackupStorage: () => ({ kind: "local" as const, directory: "/srv/role-engine/backups" }),
};

async function expectForbidden(response: Response) {
  assert.equal(response.status, 403);
  const body = await response.json() as { error: string };
  assert.equal(body.error, "FORBIDDEN");
}

describe("admin api authorization and envelopes", () => {
  it("rejects a non-admin caller on every admin endpoint", async () => {
    await expectForbidden(await adminOverviewRoute(new Request("http://localhost/admin-api/overview"), {
      requirePlatformAdmin: deny,
      getAdminHealthSnapshot: async () => healthSnapshot,
      getBackupOverview: async () => ({ storage: { kind: "local" as const, directory: "/srv" }, totalCount: 0, lastBackup: null }),
    }));

    await expectForbidden(await adminHealthRoute(new Request("http://localhost/admin-api/health"), {
      requirePlatformAdmin: deny,
      getAdminHealthSnapshot: async () => healthSnapshot,
    }));

    await expectForbidden(await listAdminBackupsRoute(new Request("http://localhost/admin-api/backups"), { ...backupDependencies, requirePlatformAdmin: deny }));
    await expectForbidden(await createAdminBackupRoute(new Request("http://localhost/admin-api/backups", { method: "POST" }), { ...backupDependencies, requirePlatformAdmin: deny }));

    await expectForbidden(await deleteAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      { requirePlatformAdmin: deny, deleteBackup: async () => backupRecord },
    ));

    await expectForbidden(await downloadAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/download`),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      {
        requirePlatformAdmin: deny,
        openBackupDownload: async () => ({ backupId: backupRecord.id, fileName: backupRecord.fileName, sizeBytes: 4, stream: new Blob(["data"]).stream() }),
      },
    ));

    await expectForbidden(await restoreAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/restore`, { method: "POST", body: JSON.stringify({ confirm: "RESTORE" }) }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      { requirePlatformAdmin: deny, restoreBackup: async () => restoreResult },
    ));
  });

  it("returns the overview and health snapshots for an admin", async () => {
    const overview = await adminOverviewRoute(new Request("http://localhost/admin-api/overview"), {
      requirePlatformAdmin: allow,
      getAdminHealthSnapshot: async () => healthSnapshot,
      getBackupOverview: async () => ({ storage: { kind: "local", directory: "/srv/role-engine/backups" }, totalCount: 1, lastBackup: backupRecord }),
    });
    assert.equal(overview.status, 200);
    assert.equal(overview.headers.get("cache-control"), "no-store");
    const overviewBody = await overview.json() as { health: unknown; backup: { totalCount: number } };
    assert.deepEqual(overviewBody.health, healthSnapshot);
    assert.equal(overviewBody.backup.totalCount, 1);

    const health = await adminHealthRoute(new Request("http://localhost/admin-api/health"), {
      requirePlatformAdmin: allow,
      getAdminHealthSnapshot: async () => healthSnapshot,
    });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), healthSnapshot);
  });

  it("lists and creates backups with the acting administrator attached", async () => {
    const list = await listAdminBackupsRoute(new Request("http://localhost/admin-api/backups"), backupDependencies);
    assert.equal(list.status, 200);
    const listBody = await list.json() as { storage: { directory: string }; backups: AdminBackupRecord[] };
    assert.equal(listBody.storage.directory, "/srv/role-engine/backups");
    assert.deepEqual(listBody.backups, [backupRecord]);

    const capturedActorIds: (string | null)[] = [];
    const created = await createAdminBackupRoute(new Request("http://localhost/admin-api/backups", { method: "POST" }), {
      ...backupDependencies,
      createBackup: async (input: { actorId: string | null }) => {
        capturedActorIds.push(input.actorId);
        return backupRecord;
      },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(capturedActorIds, [actor.id]);
  });

  it("deletes and downloads with the documented headers", async () => {
    const deleted = await deleteAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      { requirePlatformAdmin: allow, deleteBackup: async () => backupRecord },
    );
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { backup: backupRecord });

    const download = await downloadAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/download`),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      {
        requirePlatformAdmin: allow,
        openBackupDownload: async () => ({
          backupId: backupRecord.id,
          fileName: backupRecord.fileName,
          sizeBytes: 9,
          stream: new Blob(["dump-data"]).stream(),
        }),
      },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.equal(download.headers.get("content-disposition"), `attachment; filename="${backupRecord.fileName}"`);
    assert.equal(download.headers.get("content-length"), "9");
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await download.text(), "dump-data");
  });

  it("maps a not-found delete to the shared 404 envelope", async () => {
    const response = await deleteAdminBackupRoute(
      new Request("http://localhost/admin-api/backups/backup-20260919t020000z-deadbeef", { method: "DELETE" }),
      { params: Promise.resolve({ backupId: "backup-20260919t020000z-deadbeef" }) },
      {
        requirePlatformAdmin: allow,
        deleteBackup: async () => {
          throw appError("BACKUP_NOT_FOUND", "Backup was not found", 404);
        },
      },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "BACKUP_NOT_FOUND", message: "Backup was not found" });
  });

  it("requires confirmation for restore and returns the restore outcome", async () => {
    const captured: Array<{ backupId: string; actorId: string }> = [];
    const restoreDependencies = {
      requirePlatformAdmin: allow,
      restoreBackup: async (input: { backupId: string; actorId: string }) => {
        captured.push(input);
        return restoreResult;
      },
    };

    const withoutConfirmation = await restoreAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/restore`, { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      restoreDependencies,
    );
    assert.equal(withoutConfirmation.status, 400);
    assert.equal((await withoutConfirmation.json() as { error: string }).error, "VALIDATION_FAILED");

    // A client can only confirm: archive paths, connection strings or commands are rejected.
    const tampered = await restoreAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirm: "RESTORE", targetPath: "C:\\etc\\passwd", connectionString: "postgresql://x", command: "rm -rf /" }),
      }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      restoreDependencies,
    );
    assert.equal(tampered.status, 400);
    assert.equal(captured.length, 0);

    const restored = await restoreAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/restore`, { method: "POST", body: JSON.stringify({ confirm: "RESTORE" }) }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      restoreDependencies,
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.headers.get("cache-control"), "no-store");
    assert.deepEqual(await restored.json(), restoreResult);
    assert.deepEqual(captured, [{ backupId: backupRecord.id, actorId: actor.id }]);
  });

  it("exposes restore as POST only", () => {
    assert.equal(typeof restoreRoute.POST, "function");
    assert.equal("GET" in restoreRoute, false);
    assert.equal("DELETE" in restoreRoute, false);
    assert.equal("PUT" in restoreRoute, false);
  });

  it("validates the backup id before the restore service is reached", async () => {
    const response = await restoreAdminBackupRoute(
      new Request("http://localhost/admin-api/backups/..%2F..%2Fetc%2Fpasswd/restore", { method: "POST", body: JSON.stringify({ confirm: "RESTORE" }) }),
      { params: Promise.resolve({ backupId: "../../etc/passwd" }) },
      {
        requirePlatformAdmin: allow,
        restoreBackup: async () => {
          throw new Error("restore must not be reached for an unsafe identifier");
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: string }).error, "BAD_REQUEST");
  });

  it("maps a restore failure to the shared envelope", async () => {
    const response = await restoreAdminBackupRoute(
      new Request(`http://localhost/admin-api/backups/${backupRecord.id}/restore`, { method: "POST", body: JSON.stringify({ confirm: "RESTORE" }) }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      {
        requirePlatformAdmin: allow,
        restoreBackup: async () => {
          throw appError("RESTORE_TOOL_UNAVAILABLE", "Restore tool executable was not found", 503);
        },
      },
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "RESTORE_TOOL_UNAVAILABLE", message: "Restore tool executable was not found" });
  });

  it("validates the backup id before storage is touched", async () => {
    const response = await downloadAdminBackupRoute(
      new Request("http://localhost/admin-api/backups/..%2F..%2Fetc%2Fpasswd/download"),
      { params: Promise.resolve({ backupId: "../../etc/passwd" }) },
      {
        requirePlatformAdmin: allow,
        openBackupDownload: async () => {
          throw new Error("storage must not be reached for an unsafe identifier");
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: string }).error, "BAD_REQUEST");
  });

  it("rejects cross-site admin mutations even for a valid administrator session", async () => {
    const crossSiteHeaders = { origin: "https://evil.example", host: "roleengine.ddns.org" };
    const url = "https://roleengine.ddns.org/admin-api/backups";

    const created = await createAdminBackupRoute(new Request(url, { method: "POST", headers: crossSiteHeaders }), {
      ...backupDependencies,
      requirePlatformAdmin: allow,
    });
    assert.equal(created.status, 403);
    assert.equal((await created.json() as { error: string }).error, "ADMIN_ORIGIN_NOT_ALLOWED");

    const deleted = await deleteAdminBackupRoute(
      new Request(`${url}/${backupRecord.id}`, { method: "DELETE", headers: crossSiteHeaders }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      { requirePlatformAdmin: allow, deleteBackup: async () => backupRecord },
    );
    assert.equal(deleted.status, 403);
    assert.equal((await deleted.json() as { error: string }).error, "ADMIN_ORIGIN_NOT_ALLOWED");

    const restored = await restoreAdminBackupRoute(
      new Request(`${url}/${backupRecord.id}/restore`, {
        method: "POST",
        headers: { ...crossSiteHeaders, "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RESTORE" }),
      }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      {
        requirePlatformAdmin: allow,
        restoreBackup: async () => {
          throw new Error("cross-site restore must never reach the restore service");
        },
      },
    );
    assert.equal(restored.status, 403);
    assert.equal((await restored.json() as { error: string }).error, "ADMIN_ORIGIN_NOT_ALLOWED");
  });

  it("accepts the same-origin mutations the console UI performs", async () => {
    const sameOriginHeaders = { origin: "https://roleengine.ddns.org", host: "roleengine.ddns.org" };
    const url = "https://roleengine.ddns.org/admin-api/backups";

    const created = await createAdminBackupRoute(new Request(url, {
      method: "POST",
      headers: { ...sameOriginHeaders, "sec-fetch-site": "same-origin" },
    }), { ...backupDependencies, requirePlatformAdmin: allow });
    assert.equal(created.status, 201);

    const deleted = await deleteAdminBackupRoute(
      new Request(`${url}/${backupRecord.id}`, { method: "DELETE", headers: sameOriginHeaders }),
      { params: Promise.resolve({ backupId: backupRecord.id }) },
      { requirePlatformAdmin: allow, deleteBackup: async () => backupRecord },
    );
    assert.equal(deleted.status, 200);
  });
});
