import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, LayoutDashboard, LogOut, WandSparkles } from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { I18nProvider } from "@/i18n/client";
import { getTranslator } from "@/i18n/server";
import { getActiveWorkspace } from "@/server/authz";
import "./globals.css";

export const metadata: Metadata = {
  title: "Role Engine",
  description: "Dynamic character management for Game Masters and players"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const { language, t } = await getTranslator();
  const activeWorkspace = session?.user?.id ? await getActiveWorkspace(session.user.id) : null;
  const hasWritableWorkspace = Boolean(activeWorkspace?.canWrite);
  return (
    <html lang={language}>
      <body>
        <I18nProvider initialLanguage={language}>
          <div className="min-h-screen">
            <header className="border-b bg-card">
              <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                <Link href="/" className="text-lg font-semibold">
                  Role Engine
                </Link>
                {session?.user && <nav className="flex items-center gap-2 text-sm">
                  <Link className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted" href="/">
                    <LayoutDashboard className="h-4 w-4" />
                    {t("nav.dashboard")}
                  </Link>
                  {hasWritableWorkspace && <>
                    <Link className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted" href="/templates">
                      <BookOpen className="h-4 w-4" />
                      {t("nav.templates")}
                    </Link>
                    <Link className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted" href="/effects">
                      <WandSparkles className="h-4 w-4" />
                      {t("nav.effects")}
                    </Link>
                  </>}
                  <div className="ml-2 flex items-center gap-2 border-l pl-4">
                    <WorkspaceSwitcher userId={session.user.id} />
                    <LanguageSwitcher />
                    <div className="hidden text-right sm:block">
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
                </nav>}
                {!session?.user && <LanguageSwitcher />}
              </div>
            </header>
            <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
