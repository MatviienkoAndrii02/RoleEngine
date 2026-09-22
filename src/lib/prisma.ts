import { PrismaClient } from "@prisma/client";
import { assertDatabaseWritesAllowed } from "@/server/admin/database-maintenance";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

  // Write barrier for database restores: while pg_restore replaces the schema, application
  // writes are rejected instead of racing with it. The extension only screens the operation
  // and forwards it unchanged, so the guarded client behaves exactly like a plain client when
  // no restore is running; the cast keeps the exported type and the call sites untouched.
  const guarded = client.$extends({
    query: {
      $allOperations({ operation, args, query }) {
        assertDatabaseWritesAllowed(operation);
        return query(args);
      }
    }
  });

  return guarded as unknown as PrismaClient;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

