import { AdminPlaceholder } from "@/components/admin/admin-placeholder";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminMetricsPage() {
  await requirePagePlatformAdmin("/admin/metrics");

  return (
    <AdminPlaceholder titleKey="admin.metrics.title" descriptionKey="admin.metrics.description" />
  );
}