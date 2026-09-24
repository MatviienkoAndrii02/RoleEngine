import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { getTranslator } from "@/i18n/server";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

export default async function AdminUsersPage() {
  await requirePagePlatformAdmin("/admin/users");
  const { t } = await getTranslator();

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("admin.users.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("admin.users.subtitle")}</p>
      </div>
      <AdminUsersPanel />
    </div>
  );
}
