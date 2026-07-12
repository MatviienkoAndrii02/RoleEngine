"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";

type DashboardSort = "updated" | "created" | "name" | "nodes" | "effects";

type PlayerOption = {
  id: string;
  label: string;
};

export function DashboardControls({
  initialQuery,
  initialOwner,
  initialSort,
  hasWritableWorkspace,
  players,
}: {
  initialQuery: string;
  initialOwner: string;
  initialSort: DashboardSort;
  hasWritableWorkspace: boolean;
  players: PlayerOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [owner, setOwner] = useState(initialOwner);
  const [sort, setSort] = useState<DashboardSort>(initialSort);

  const currentUrl = useMemo(() => buildDashboardUrl({ pathname, query: initialQuery, owner: initialOwner, sort: initialSort }), [
    initialOwner,
    initialQuery,
    initialSort,
    pathname,
  ]);

  useEffect(() => {
    setQuery(initialQuery);
    setOwner(initialOwner);
    setSort(initialSort);
  }, [initialOwner, initialQuery, initialSort]);

  useEffect(() => {
    const nextUrl = buildDashboardUrl({ pathname, query, owner, sort });
    if (nextUrl === currentUrl) return;
    const handle = window.setTimeout(() => {
      startTransition(() => router.replace(nextUrl, { scroll: false }));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [currentUrl, owner, pathname, query, router, sort]);

  function updateOwner(nextOwner: string) {
    setOwner(nextOwner);
    const nextUrl = buildDashboardUrl({ pathname, query, owner: nextOwner, sort });
    startTransition(() => router.replace(nextUrl, { scroll: false }));
  }

  function updateSort(nextSort: DashboardSort) {
    setSort(nextSort);
    const nextUrl = buildDashboardUrl({ pathname, query, owner, sort: nextSort });
    startTransition(() => router.replace(nextUrl, { scroll: false }));
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("dashboard.searchPlaceholder")}
          aria-label={t("common.search")}
        />
      </div>
      {hasWritableWorkspace && (
        <label className="flex items-center gap-2 rounded-md border bg-card px-3 text-sm">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="h-9 bg-transparent outline-none"
            value={owner}
            onChange={(event) => updateOwner(event.target.value)}
            disabled={isPending}
          >
            <option value="all">{t("dashboard.allActive")}</option>
            <option value="unassigned">{t("dashboard.unassigned")}</option>
            <option value="archived">{t("dashboard.archived")}</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <label className="rounded-md border bg-card px-3 text-sm">
          <select
            className="h-9 bg-transparent outline-none"
            value={sort}
            onChange={(event) => updateSort(event.target.value as DashboardSort)}
            disabled={isPending}
          >
            <option value="updated">{t("dashboard.sort.updated")}</option>
            <option value="created">{t("dashboard.sort.created")}</option>
            <option value="name">{t("dashboard.sort.name")}</option>
            <option value="nodes">{t("dashboard.sort.nodes")}</option>
            <option value="effects">{t("dashboard.sort.effects")}</option>
          </select>
        </label>
        <Button asChild variant="outline">
          <Link href="/">{t("common.reset")}</Link>
        </Button>
      </div>
    </div>
  );
}

function buildDashboardUrl({
  pathname,
  query,
  owner,
  sort,
}: {
  pathname: string;
  query: string;
  owner: string;
  sort: DashboardSort;
}) {
  const params = new URLSearchParams();
  const trimmedQuery = query.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  if (owner !== "all") params.set("owner", owner);
  if (sort !== "updated") params.set("sort", sort);
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}
