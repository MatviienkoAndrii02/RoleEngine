import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Filter, Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RestoreCharacterButton } from "@/components/characters/restore-character-button";
import { requirePageUser } from "@/server/page-auth";
import { getActiveWorkspace } from "@/server/authz";
import { getTranslator } from "@/i18n/server";

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "name", label: "Name A-Z" },
  { value: "nodes", label: "Most nodes" },
  { value: "effects", label: "Most effects" }
] as const;

type DashboardSort = (typeof SORT_OPTIONS)[number]["value"];

type DashboardSearchParams = {
  forbidden?: string;
  q?: string;
  owner?: string;
  sort?: string;
  page?: string;
};

type DashboardUser = Awaited<ReturnType<typeof requirePageUser>>;

function normalizeQuery(value: string | undefined) {
  return value?.trim().slice(0, 120) ?? "";
}

function normalizeSort(value: string | undefined): DashboardSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as DashboardSort) : "updated";
}

function normalizePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getOrderBy(sort: DashboardSort): Prisma.CharacterOrderByWithRelationInput[] {
  if (sort === "created") return [{ createdAt: "desc" }];
  if (sort === "name") return [{ name: "asc" }];
  if (sort === "nodes") return [{ rootNodes: { _count: "desc" } }, { updatedAt: "desc" }];
  if (sort === "effects") return [{ effects: { _count: "desc" } }, { updatedAt: "desc" }];
  return [{ updatedAt: "desc" }];
}

function getCharacterWhere(
  user: DashboardUser,
  query: string,
  ownerFilter: string,
  activeWorkspace: Awaited<ReturnType<typeof getActiveWorkspace>>,
): Prisma.CharacterWhereInput {
  const filters: Prisma.CharacterWhereInput[] = [];

  const scopeFilters: Prisma.CharacterWhereInput[] = [];
  if (activeWorkspace?.canWrite) {
    if (ownerFilter === "archived") {
      scopeFilters.push({ archivedAt: { not: null }, workspaceId: activeWorkspace.id });
    } else {
      const writableFilter: Prisma.CharacterWhereInput = { archivedAt: null, workspaceId: activeWorkspace.id };
      if (ownerFilter === "unassigned") {
        writableFilter.ownerId = null;
      } else if (ownerFilter !== "all") {
        writableFilter.ownerId = ownerFilter;
      }
      scopeFilters.push(writableFilter);
    }
  }
  if (activeWorkspace && ownerFilter !== "archived") {
    scopeFilters.push({
      archivedAt: null,
      workspaceId: activeWorkspace.id,
      assignments: { some: { userId: user.id, canView: true } },
      workspace: { archivedAt: null, memberships: { some: { userId: user.id, role: "PLAYER" } } },
    });
  }
  filters.push(scopeFilters.length ? { OR: scopeFilters } : { id: "__no_access__" });

  if (query) {
    filters.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { owner: { is: { name: { contains: query, mode: "insensitive" } } } },
        { owner: { is: { email: { contains: query, mode: "insensitive" } } } }
      ]
    });
  }

  return filters.length === 1 ? filters[0] : { AND: filters };
}

function dashboardHref(params: { q: string; owner: string; sort: DashboardSort }, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.owner !== "all") query.set("owner", params.owner);
  if (params.sort !== "updated") query.set("sort", params.sort);
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const user = await requirePageUser("/");
  const { t } = await getTranslator();
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const sort = normalizeSort(params.sort);
  const activeWorkspace = await getActiveWorkspace(user.id);
  const hasWritableWorkspace = Boolean(activeWorkspace?.canWrite);
  const ownerFilter = hasWritableWorkspace ? params.owner ?? "all" : "all";
  const page = normalizePage(params.page);
  const where = getCharacterWhere(user, query, ownerFilter, activeWorkspace);

  const [totalCharacters, players] = await Promise.all([
    prisma.character.count({ where }),
    hasWritableWorkspace
      ? prisma.user.findMany({
          where: { workspaceMemberships: { some: { workspaceId: activeWorkspace?.id, role: "PLAYER" } } },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: { id: true, name: true, email: true }
        })
      : Promise.resolve([])
  ]).catch(() => [0, []] as const);
  const totalPages = Math.max(1, Math.ceil(totalCharacters / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const characters = await prisma.character
    .findMany({
      where,
      include: { owner: true, _count: { select: { rootNodes: { where: { archivedAt: null } }, effects: true } } },
      orderBy: getOrderBy(sort),
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    })
    .catch(() => []);
  const firstResult = totalCharacters === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(currentPage * PAGE_SIZE, totalCharacters);
  const activeParams = { q: query, owner: ownerFilter, sort };

  return (
    <div className="space-y-6">
      {params.forbidden === "gm" && (
        <div className="rounded-md border border-accent bg-accent/10 p-3 text-sm">
          {t("dashboard.forbiddenGM")}
        </div>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        {hasWritableWorkspace && <Button asChild><Link href="/characters/new"><Plus className="h-4 w-4" />{t("dashboard.newCharacter")}</Link></Button>}
      </div>

      <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]" action="/">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" name="q" defaultValue={query} placeholder={t("dashboard.searchPlaceholder")} />
        </div>
        {hasWritableWorkspace && (
          <label className="flex items-center gap-2 rounded-md border bg-card px-3 text-sm">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select className="h-9 bg-transparent outline-none" name="owner" defaultValue={ownerFilter}>
              <option value="all">{t("dashboard.allActive")}</option>
              <option value="unassigned">{t("dashboard.unassigned")}</option>
              <option value="archived">{t("dashboard.archived")}</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name ?? player.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="rounded-md border bg-card px-3 text-sm">
          <select className="h-9 bg-transparent outline-none" name="sort" defaultValue={sort}>
            <option value="updated">{t("dashboard.sort.updated")}</option>
            <option value="created">{t("dashboard.sort.created")}</option>
            <option value="name">{t("dashboard.sort.name")}</option>
            <option value="nodes">{t("dashboard.sort.nodes")}</option>
            <option value="effects">{t("dashboard.sort.effects")}</option>
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit">
            <Search className="h-4 w-4" />
            {t("common.apply")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t("common.reset")}</Link>
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {totalCharacters === 0 ? t("dashboard.noMatches") : t("dashboard.showing", { first: firstResult, last: lastResult, total: totalCharacters })}
        </span>
        {(query || ownerFilter !== "all" || sort !== "updated") && <Badge>{t("common.filtered")}</Badge>}
      </div>

      <div className="grid gap-3">
        {characters.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{query || ownerFilter !== "all" ? t("dashboard.noMatchingTitle") : t("dashboard.noCharactersTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {hasWritableWorkspace ? t("dashboard.noCharactersGM") : t("dashboard.noCharactersPlayer")}
            </CardContent>
          </Card>
        ) : (
          characters.map((character) => {
            const card = (
              <Card className="transition-colors hover:bg-muted/60">
                <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{character.name}</div>
                      {character.archivedAt && <Badge>{t("dashboard.archived")}</Badge>}
                      <Badge>{hasWritableWorkspace ? t("dashboard.access.edit") : t("dashboard.access.view")}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {character.owner?.name ?? character.owner?.email ?? t("dashboard.unassigned")}
                      {character.description ? ` · ${character.description}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{t("dashboard.nodes", { count: character._count.rootNodes })}</Badge>
                    <Badge>{t("dashboard.effects", { count: character._count.effects })}</Badge>
                    {character.archivedAt && <RestoreCharacterButton characterId={character.id} name={character.name} />}
                  </div>
                </CardContent>
              </Card>
            );

            return character.archivedAt ? (
              <div key={character.id}>{card}</div>
            ) : (
              <Link key={character.id} href={`/characters/${character.id}`}>
                {card}
              </Link>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" aria-disabled={currentPage <= 1}>
            <Link
              className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
              href={dashboardHref(activeParams, currentPage - 1)}
            >
              {t("dashboard.previous")}
            </Link>
          </Button>
          <div className="text-sm text-muted-foreground">
            {t("dashboard.page", { current: currentPage, total: totalPages })}
          </div>
          <Button asChild variant="outline" aria-disabled={currentPage >= totalPages}>
            <Link
              className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
              href={dashboardHref(activeParams, currentPage + 1)}
            >
              {t("dashboard.next")}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
