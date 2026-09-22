import { PrismaClient } from "@prisma/client";
import { scanWorkspaceJsonIntegrity, type WorkspaceJsonIntegrityScanEntry } from "@/server/json-integrity";

const prisma = new PrismaClient();

/** Admin/import integrity run: `npm run integrity:audit -- [--workspace=<id|all>] [--apply] [--fail-on-findings]` */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const failOnFindings = args.includes("--fail-on-findings");
  const workspaceFilter = args.find((arg) => arg.startsWith("--workspace="))?.slice("--workspace=".length) ?? "all";

  const workspaces = await prisma.workspace.findMany({
    where: workspaceFilter === "all" ? { archivedAt: null } : { id: workspaceFilter },
    select: { id: true, name: true, ownerId: true },
    orderBy: { name: "asc" },
  });

  if (!workspaces.length) {
    console.log("json-integrity audit: no workspaces matched the requested scope");
    return;
  }

  let totalFindings = 0;
  let totalRepaired = 0;
  let totalQuarantined = 0;

  for (const workspace of workspaces) {
    const actorId = await resolveAuditActor(workspace.id, workspace.ownerId);
    const results = await scanWorkspaceJsonIntegrity({ workspaceId: workspace.id, actorId, apply });
    if (!results.length) continue;

    console.log(`\nWorkspace ${workspace.name} (${workspace.id}); actor ${actorId ?? "none"}`);
    for (const result of results) printResult(result);
    totalFindings += results.reduce((sum, result) => sum + result.entries.length, 0);
    totalRepaired += results.reduce((sum, result) => sum + result.repaired, 0);
    totalQuarantined += results.reduce((sum, result) => sum + result.quarantined, 0);
  }

  console.log(`\njson-integrity audit (${apply ? "apply" : "dry-run"}): ${totalFindings} finding(s), repaired ${totalRepaired}, quarantined ${totalQuarantined}`);
  if (!apply && failOnFindings && totalFindings > 0) process.exitCode = 1;
}

async function resolveAuditActor(workspaceId: string, ownerId: string | null) {
  if (ownerId) {
    const owner = await prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId: ownerId, role: "OWNER" },
      select: { userId: true },
    });
    if (owner) return owner.userId;
  }

  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, role: { in: ["OWNER", "GM"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

function printResult(result: WorkspaceJsonIntegrityScanEntry) {
  console.log(`  ${result.scopeKind} ${result.scopeName} (${result.scopeId})`);
  for (const entry of result.entries) {
    console.log(`    - [${entry.entityType}/${entry.field}] ${entry.entityName}: ${entry.repairable ? "repairable" : "manual-fix"}`);
    for (const issue of entry.issues.slice(0, 3)) console.log(`        ${issue}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
