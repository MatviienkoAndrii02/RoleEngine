import { AdminPlaceholder } from "@/components/admin/admin-placeholder";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminLogsPage() {
  await requirePagePlatformAdmin("/admin/logs");

  return (
    <AdminPlaceholder titleKey="admin.logs.title" descriptionKey="admin.logs.description" />
  );
}