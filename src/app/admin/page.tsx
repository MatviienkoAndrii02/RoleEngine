import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getTranslator } from "@/i18n/server";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminOverviewPage() {
  await requirePagePlatformAdmin("/admin");
  const { t } = await getTranslator();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("admin.dashboard.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.dashboard.subtitle")}</p>
      </div>
      <AdminDashboard />
    </div>
  );
}