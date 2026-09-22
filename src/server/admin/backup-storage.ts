import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { appError } from "@/server/errors";
import { getAdminBackupDirectory } from "@/server/admin/config";

const safeFileNamePattern = /^[a-z0-9][a-z0-9._-]{0,120}$/;

export type AdminBackupStorageFile = {
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
};

// Storage seam: the admin backup service only knows this interface, so a future
// MinIO/S3 implementation can replace the local filesystem without touching the API
// or the UI. `resolvePath` exists because the database tool writes to an OS path;
// a remote backend would stage the dump locally first.
export type AdminBackupStorage = {
  readonly kind: "local";
  readonly directory: string;
  ensureReady(): Promise<void>;
  resolvePath(fileName: string): string;
  listFiles(): Promise<AdminBackupStorageFile[]>;
  statFile(fileName: string): Promise<AdminBackupStorageFile | null>;
  removeFile(fileName: string): Promise<void>;
  readJson(fileName: string): Promise<unknown | null>;
  writeJson(fileName: string, value: unknown): Promise<void>;
  openReadStream(fileName: string): Promise<{ sizeBytes: number; stream: ReadableStream<Uint8Array> }>;
};

const storageCache = new Map<string, AdminBackupStorage>();

export function getBackupStorage(): AdminBackupStorage {
  const directory = getAdminBackupDirectory();
  const cached = storageCache.get(directory);
  if (cached) return cached;
  const storage = createLocalBackupStorage(directory);
  storageCache.set(directory, storage);
  return storage;
}

export function createLocalBackupStorage(directory: string): AdminBackupStorage {
  const root = path.resolve(directory);

  function resolveInside(fileName: string): string {
    if (!safeFileNamePattern.test(fileName)) {
      throw appError("BAD_REQUEST", "Unsafe backup file name", 400, { fileName });
    }
    const candidate = path.resolve(root, fileName);
    if (!candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)) {
      throw appError("BAD_REQUEST", "Unsafe backup file name", 400, { fileName });
    }
    return candidate;
  }

  async function toStorageFile(absolutePath: string, fileName: string): Promise<AdminBackupStorageFile | null> {
    try {
      const stats = await fs.promises.stat(absolutePath);
      if (!stats.isFile()) return null;
      return { fileName, sizeBytes: stats.size, createdAt: stats.mtime };
    } catch {
      return null;
    }
  }

  return {
    kind: "local",
    directory: root,
    resolvePath(fileName) {
      return resolveInside(fileName);
    },
    async ensureReady() {
      try {
        await fs.promises.mkdir(root, { recursive: true });
      } catch (error) {
        throw appError("BACKUP_STORAGE_UNAVAILABLE", "Backup storage directory is not writable", 500, {
          directory: root,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
    async listFiles() {
      let entries: string[];
      try {
        entries = await fs.promises.readdir(root);
      } catch (error) {
        if (isMissingPathError(error)) return [];
        throw appError("BACKUP_STORAGE_UNAVAILABLE", "Backup storage directory could not be read", 500, {
          directory: root,
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      const files: AdminBackupStorageFile[] = [];
      for (const entry of entries) {
        if (!safeFileNamePattern.test(entry)) continue;
        const file = await toStorageFile(path.join(root, entry), entry);
        if (file) files.push(file);
      }
      return files;
    },
    async statFile(fileName) {
      return toStorageFile(resolveInside(fileName), fileName);
    },
    async removeFile(fileName) {
      try {
        await fs.promises.rm(resolveInside(fileName), { force: true });
      } catch (error) {
        throw appError("BACKUP_DELETE_FAILED", "Backup file could not be removed", 500, {
          fileName,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
    async readJson(fileName) {
      try {
        const contents = await fs.promises.readFile(resolveInside(fileName), "utf8");
        return JSON.parse(contents) as unknown;
      } catch {
        // A missing or malformed manifest is not fatal: callers fall back to the
        // facts they can observe from the dump file itself.
        return null;
      }
    },
    async writeJson(fileName, value) {
      try {
        await fs.promises.writeFile(resolveInside(fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
      } catch (error) {
        throw appError("BACKUP_STORAGE_UNAVAILABLE", "Backup metadata could not be written", 500, {
          fileName,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
    async openReadStream(fileName) {
      const absolutePath = resolveInside(fileName);
      const stats = await toStorageFile(absolutePath, fileName);
      if (!stats) throw appError("BACKUP_NOT_FOUND", "Backup file was not found", 404, { fileName });
      const nodeStream = fs.createReadStream(absolutePath);
      // Readable.toWeb returns a web stream of Buffer chunks; the cast keeps the
      // route handler signature typed for the Response body.
      const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
      return { sizeBytes: stats.sizeBytes, stream };
    },
  };
}

function isMissingPathError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}