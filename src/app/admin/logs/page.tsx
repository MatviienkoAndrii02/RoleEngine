import { AdminLogsPanel } from "@/components/admin/admin-logs-panel";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminLogsPage() {
  await requirePagePlatformAdmin("/admin/logs");

  return <AdminLogsPanel />;
}
