"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Database,
  FileText,
  Gauge,
  HardDriveDownload,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n/client";

type AdminSection = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
};

const sections: AdminSection[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/backups", labelKey: "admin.nav.backups", icon: HardDriveDownload },
  { href: "/admin/health", labelKey: "admin.nav.health", icon: Activity },
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users },
  { href: "/admin/metrics", labelKey: "admin.nav.metrics", icon: Gauge },
  { href: "/admin/logs", labelKey: "admin.nav.logs", icon: FileText },
  { href: "/admin/database", labelKey: "admin.nav.database", icon: Database },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col" aria-label={t("admin.title")}>
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-2 text-xs sm:px-3 sm:text-sm ${active ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{t(section.labelKey)}</span>
          </Link>
        );
      })}
      <Link
        href="/"
        className="col-span-2 inline-flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-muted/60 sm:col-span-1 sm:px-3 sm:text-sm lg:col-span-1"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">{t("admin.backToApp")}</span>
      </Link>
    </nav>
  );
}
