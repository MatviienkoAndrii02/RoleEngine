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
  { href: "/admin/metrics", labelKey: "admin.nav.metrics", icon: Gauge },
  { href: "/admin/logs", labelKey: "admin.nav.logs", icon: FileText },
  { href: "/admin/database", labelKey: "admin.nav.database", icon: Database },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label={t("admin.title")}>
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm ${active ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
          >
            <Icon className="h-4 w-4" />
            {t(section.labelKey)}
          </Link>
        );
      })}
      <Link
        href="/"
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("admin.backToApp")}
      </Link>
    </nav>
  );
}