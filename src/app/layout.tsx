import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { BookOpen, ChevronDown, LayoutDashboard, LogOut, Menu, ShieldCheck } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { UserPresenceHeartbeat } from "@/components/admin/user-presence-heartbeat";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { I18nProvider } from "@/i18n/client";
import { getTranslator } from "@/i18n/server";
import { getActiveWorkspace, getRequestWorkspaceId, requireUserWorkspace } from "@/server/authz";
import { isPlatformAdminAccount } from "@/server/admin/authz";
import "./globals.css";

export const metadata: Metadata = {
  title: "Role Engine",
  description: "Dynamic character management for Game Masters and players"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const themeCookie = (await cookies()).get("role-engine-theme")?.value;
  const initialDark = themeCookie === "dark";
  const { language, t } = await getTranslator();
  const requestWorkspaceId = await getRequestWorkspaceId();
  const activeWorkspace = session?.user?.id
    ? requestWorkspaceId
      ? await requireUserWorkspace(session.user.id, requestWorkspaceId)
      : await getActiveWorkspace(session.user.id)
    : null;
  const hasWritableWorkspace = Boolean(activeWorkspace?.canWrite);
  // Navigation hint only: the Admin Console authorizes every request on the server.
  const isPlatformAdmin = session?.user?.id
    ? isPlatformAdminAccount({ id: session.user.id, email: session.user.email ?? null })
    : false;
  const accountLabel = session?.user?.name ?? session?.user?.email ?? "";
  return (
    <html lang={language} className={initialDark ? "dark" : undefined}>
      <body>
        <I18nProvider initialLanguage={language}>
          {session?.user && <UserPresenceHeartbeat />}
          <div className="min-h-screen w-full min-w-0 overflow-x-clip">
            <header className="w-full border-b bg-card">
              <div className="mx-auto flex w-full min-w-0 max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
                <Link href={activeWorkspace ? `/workspaces/${activeWorkspace.id}` : "/"} className="shrink-0 text-lg font-semibold">
                  Role Engine
                </Link>
                {session?.user && <>
                  <details className="group relative ml-auto min-w-0 md:hidden">
                    <summary className="flex min-h-11 min-w-0 max-w-[min(18rem,calc(100vw-10rem))] cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <Menu className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{accountLabel}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-border bg-card p-3 shadow-lg">
                      <div className="mb-2 break-words border-b px-3 pb-3 text-sm font-medium">{accountLabel}</div>
                      <nav className="grid gap-1 text-sm">
                        <Link className="flex min-h-11 items-center gap-3 rounded-md px-3 hover:bg-muted" href={activeWorkspace ? `/workspaces/${activeWorkspace.id}` : "/"}>
                          <LayoutDashboard className="h-4 w-4" />{t("nav.dashboard")}
                        </Link>
                        {hasWritableWorkspace && <Link className="flex min-h-11 items-center gap-3 rounded-md px-3 hover:bg-muted" href={activeWorkspace ? `/workspaces/${activeWorkspace.id}/templates` : "/templates"}>
                          <BookOpen className="h-4 w-4" />{t("nav.templates")}
                        </Link>}
                        {isPlatformAdmin && <Link className="flex min-h-11 items-center gap-3 rounded-md px-3 hover:bg-muted" href="/admin">
                          <ShieldCheck className="h-4 w-4" />{t("admin.title")}
                        </Link>}
                      </nav>
                      <div className="mt-3 grid gap-3 border-t pt-3">
                        <WorkspaceSwitcher userId={session.user.id} />
                        <LanguageSwitcher />
                        <ThemeSwitcher initialDark={initialDark} />
                        <form action={async () => {
                          "use server";
                          await signOut({ redirectTo: "/login" });
                        }}>
                          <Button type="submit" variant="outline" className="min-h-11 w-full justify-start">
                            <LogOut className="h-4 w-4" />{t("nav.signOut")}
                          </Button>
                        </form>
                      </div>
                    </div>
                  </details>
                  <nav className="hidden min-w-0 flex-wrap items-center justify-end gap-2 text-sm md:flex">
                  <Link aria-label={t("nav.dashboard")} className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted" href={activeWorkspace ? `/workspaces/${activeWorkspace.id}` : "/"}>
                    <LayoutDashboard className="h-4 w-4" />
                    {t("nav.dashboard")}
                  </Link>
                  {hasWritableWorkspace && <>
                    <Link aria-label={t("nav.templates")} className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted" href={activeWorkspace ? `/workspaces/${activeWorkspace.id}/templates` : "/templates"}>
                      <BookOpen className="h-4 w-4" />
                      {t("nav.templates")}
                    </Link>
                  </>}
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-l pl-3">
                    {isPlatformAdmin && (
                      <Link
                        aria-label={t("admin.title")}
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted"
                        href="/admin"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {t("admin.title")}
                      </Link>
                    )}
                    <WorkspaceSwitcher userId={session.user.id} />
                    <LanguageSwitcher />
                    <ThemeSwitcher initialDark={initialDark} compact />
                    <div className="text-right">
                      <div className="max-w-40 truncate text-xs font-medium">{session.user.name ?? session.user.email}</div>
                    </div>
                    <form action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}>
                      <Button type="submit" variant="ghost" size="icon" title={t("nav.signOut")} aria-label={t("nav.signOut")}>
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                  </nav>
                </>}
                {!session?.user && <>
                  <LanguageSwitcher />
                  <ThemeSwitcher initialDark={initialDark} compact />
                </>}
              </div>
            </header>
            <main className="mx-auto w-full min-w-0 max-w-7xl px-3 py-4 sm:px-6 sm:py-6" data-workspace-context={activeWorkspace?.id}>{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
