import { ShieldCheck } from "lucide-react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { getTranslator } from "@/i18n/server";
import { requirePagePlatformAdmin } from "@/server/admin/authz";

// The admin shell guards the whole subtree on the server. Pages re-run the same guard so a
// data-bearing page never relies on layout execution order alone.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePagePlatformAdmin("/admin");
  const { t } = await getTranslator();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <h1 className="text-xl font-semibold">{t("admin.title")}</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("admin.subtitle")}</p>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">/admin</span>
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-card p-2">
          <AdminSidebar />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
