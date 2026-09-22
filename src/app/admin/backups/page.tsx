import { AdminBackupsManager } from "@/components/admin/admin-backups-manager";
import { getTranslator } from "@/i18n/server";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminBackupsPage() {
  await requirePagePlatformAdmin("/admin/backups");
  const { t } = await getTranslator();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("admin.backups.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.backups.subtitle")}</p>
      </div>
      <AdminBackupsManager />
    </div>
  );
}