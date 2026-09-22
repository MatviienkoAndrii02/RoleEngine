import { AdminPlaceholder } from "@/components/admin/admin-placeholder";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminDatabasePage() {
  await requirePagePlatformAdmin("/admin/database");

  return (
    <AdminPlaceholder titleKey="admin.database.title" descriptionKey="admin.database.description" />
  );
}