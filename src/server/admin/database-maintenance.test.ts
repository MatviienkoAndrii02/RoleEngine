import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@/server/errors";
import {
  assertDatabaseWritesAllowed,
  beginDatabaseMaintenance,
  endDatabaseMaintenance,
  isDatabaseMaintenanceActive,
  isDatabaseReadOperation,
} from "@/server/admin/database-maintenance";

describe("database maintenance write barrier", () => {
  it("allows every operation while no restore is running", () => {
    assert.equal(isDatabaseMaintenanceActive(), false);
    assertDatabaseWritesAllowed("create");
    assertDatabaseWritesAllowed("deleteMany");
    assertDatabaseWritesAllowed("findMany");
  });

  it("blocks writes and keeps reads available during a restore", () => {
    beginDatabaseMaintenance();
    try {
      assert.equal(isDatabaseMaintenanceActive(), true);
      for (const operation of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "$executeRaw", "$executeRawUnsafe"]) {
        assert.throws(() => assertDatabaseWritesAllowed(operation), (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, "DATABASE_MAINTENANCE");
          assert.equal(error.status, 503);
          return true;
        });
      }

      for (const operation of ["findMany", "findUnique", "count", "aggregate", "groupBy", "$queryRaw", "$queryRawUnsafe"]) {
        assert.equal(isDatabaseReadOperation(operation), true);
        assertDatabaseWritesAllowed(operation);
      }
    } finally {
      endDatabaseMaintenance();
    }

    assert.equal(isDatabaseMaintenanceActive(), false);
    assertDatabaseWritesAllowed("create");
  });

  it("stays balanced when phases overlap and never underflows", () => {
    beginDatabaseMaintenance();
    beginDatabaseMaintenance();
    endDatabaseMaintenance();
    assert.equal(isDatabaseMaintenanceActive(), true);
    endDatabaseMaintenance();
    assert.equal(isDatabaseMaintenanceActive(), false);
    endDatabaseMaintenance();
    assert.equal(isDatabaseMaintenanceActive(), false);
  });
});
