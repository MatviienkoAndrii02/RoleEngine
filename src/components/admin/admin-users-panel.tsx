"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, UserRound } from "lucide-react";
import { isAdminUsersResponse, type AdminUserSummary, type AdminUsersResponse } from "@/domain/admin-console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { adminApiUrl } from "@/lib/admin-api";
import { formatDateTime } from "@/lib/admin-format";

export function AdminUsersPanel() {
  const { t, language } = useI18n();
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(adminApiUrl("/users"), {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        setError(await localizedApiError(response, t, "admin.users.loadFailed"));
        return;
      }

      const payload: unknown = await response.json();
      if (!isAdminUsersResponse(payload)) {
        setError(t("admin.users.loadFailed"));
        return;
      }
      setData(payload);
      setError(null);
    } catch {
      setError(t("admin.users.loadFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
    const interval = window.setInterval(() => void reload(true), 30_000);
    return () => window.clearInterval(interval);
  }, [reload]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return data?.users ?? [];
    return (data?.users ?? []).filter((user) =>
      [user.name ?? "", user.email, user.username].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [data, query]);
  const onlineCount = data?.users.filter((user) => user.online).length ?? 0;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("admin.users.search")}
            aria-label={t("admin.users.search")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {data && <>
            <Badge className="border border-border bg-transparent">{t("admin.users.total", { count: data.users.length })}</Badge>
            <Badge className="bg-emerald-100 text-emerald-900">{t("admin.users.onlineCount", { count: onlineCount })}</Badge>
          </>}
          <Button type="button" size="sm" variant="outline" onClick={() => void reload(true)} disabled={refreshing || loading}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("admin.dashboard.refresh")}
          </Button>
        </div>
      </div>

      {error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
      {loading && !data && <p className="text-sm text-muted-foreground">{t("admin.dashboard.loading")}</p>}
      {!loading && visibleUsers.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("admin.users.empty")}</CardContent></Card>}

      <div className="grid min-w-0 gap-3">
        {visibleUsers.map((user) => <UserCard key={user.id} user={user} language={language} />)}
      </div>
    </div>
  );
}

function UserCard({ user, language }: { user: AdminUserSummary; language: "uk" | "en" }) {
  const { t } = useI18n();
  const lastSeen = formatDateTime(user.lastSeenAt, language);

  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground"><UserRound className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h3 className="break-words font-medium">{user.name ?? user.username}</h3>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
            </div>
          </div>
          <Badge className={user.online ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${user.online ? "bg-emerald-600" : "bg-muted-foreground/50"}`} />
            {t(user.online ? "admin.users.online" : "admin.users.offline")}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <UserCount label={t("admin.users.createdWorkspaces")} count={user.createdWorkspaceCount} />
          <UserCount label={t("admin.users.memberWorkspaces")} count={user.memberWorkspaceCount} />
          <UserCount label={t("admin.users.characters")} count={user.characterCount} />
          <UserCount label={t("admin.users.templates")} count={user.templateCount} />
        </div>

        <p className="text-xs text-muted-foreground">
          {t("admin.users.lastSeen")}: {lastSeen ?? t("admin.users.neverSeen")}
        </p>
      </CardContent>
    </Card>
  );
}

function UserCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 p-2.5">
      <p className="break-words text-xs leading-4 text-muted-foreground">{label}</p>
      <p className="mt-1 tabular-nums text-lg font-semibold">{count}</p>
    </div>
  );
}
