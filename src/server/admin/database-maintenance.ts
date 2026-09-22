import { appError } from "@/server/errors";

// Restoring a dump replaces the whole database, so while the restore tool runs the application
// must not interleave its own writes with DROP/CREATE statements. This module holds a
// process-local write barrier: it is raised right before pg_restore starts and released in a
// finally block, and the Prisma client consults it for every write operation.
//
// Limits that are documented rather than hidden: the barrier only covers writes issued through
// this process' Prisma client. Reads are intentionally still allowed, a second app instance
// would not see the flag, and a process restart drops it.
const readOperations = new Set([
  "$queryRaw",
  "$queryRawUnsafe",
  "aggregate",
  "aggregateRaw",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findRaw",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

let maintenanceDepth = 0;

export function isDatabaseMaintenanceActive(): boolean {
  return maintenanceDepth > 0;
}

export function beginDatabaseMaintenance(): void {
  maintenanceDepth += 1;
}

export function endDatabaseMaintenance(): void {
  // Never below zero: a release without a matching begin must not leave the app writable by
  // accident in a later cycle, and it must not underflow either.
  maintenanceDepth = Math.max(maintenanceDepth - 1, 0);
}

export function isDatabaseReadOperation(operation: string): boolean {
  return readOperations.has(operation);
}

export function assertDatabaseWritesAllowed(operation: string): void {
  if (maintenanceDepth === 0 || isDatabaseReadOperation(operation)) return;
  throw databaseMaintenanceError({ operation });
}

export function databaseMaintenanceError(details?: unknown) {
  return appError(
    "DATABASE_MAINTENANCE",
    "The database is being restored; try again once the restore finishes",
    503,
    details,
  );
}
