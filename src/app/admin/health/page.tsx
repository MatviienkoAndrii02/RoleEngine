import { AdminHealthPanel } from "@/components/admin/admin-health-panel";
import { getTranslator } from "@/i18n/server";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminHealthPage() {
  await requirePagePlatformAdmin("/admin/health");
  const { t } = await getTranslator();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("admin.health.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.health.subtitle")}</p>
      </div>
      <AdminHealthPanel />
    </div>
  );
}