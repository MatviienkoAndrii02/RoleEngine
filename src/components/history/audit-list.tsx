"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditAction, AuditLog } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronRight, ExternalLink, Link2, Loader2, Search } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { EffectDefinition } from "@/domain/effects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { useCharacterUiStore } from "@/store/character-ui-store";

const PAGE_SIZE = 25;

type AuditLogWithActor = Omit<AuditLog, "createdAt"> & {
  createdAt: Date | string;
  actor?: { name: string | null; email: string } | null;
};

type AuditListResponse = {
  items: AuditLogWithActor[];
  nextCursor: string | null;
  total: number;
};

type AuditEntity = "ALL" | "Character" | "CharacterNode" | "Effect" | "CharacterAssignment" | "EntityTemplate" | "TemplateNode";

export function AuditList({
  characterId,
  logs,
  nextCursor: initialNextCursor = null,
  total: initialTotal = logs.length,
  nodes = [],
  effects = [],
  maskUnknownNodeNames = false,
}: {
  characterId: string;
  logs: AuditLogWithActor[];
  nextCursor?: string | null;
  total?: number;
  nodes?: CharacterNodeModel[];
  effects?: EffectDefinition[];
  maskUnknownNodeNames?: boolean;
}) {
  const { language, t } = useI18n();
  const searchParams = useSearchParams();
  const focusedAuditId = searchParams.get("audit");
  const [items, setItems] = useState(logs);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [total, setTotal] = useState(initialTotal);
  const [actionFilter, setActionFilter] = useState<AuditAction | "ALL">("ALL");
  const [entityFilter, setEntityFilter] = useState<AuditEntity>("ALL");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [highlightedId, setHighlightedId] = useState(focusedAuditId ?? "");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => focusedAuditId ? new Set([focusedAuditId]) : new Set());
  const firstFilterRun = useRef(true);
  const openSidebarSection = useCharacterUiStore((state) => state.openSidebarSection);
  const selectNode = useCharacterUiStore((state) => state.selectNode);
  const setEditorMode = useCharacterUiStore((state) => state.setEditorMode);

  const knownNodes = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const knownEffects = useMemo(() => new Map(effects.map((effect) => [effect.id, effect])), [effects]);
  const entityOptions = useMemo(() => {
    const values = new Set<AuditEntity>(["Character", "CharacterNode", "Effect", "CharacterAssignment", "EntityTemplate", "TemplateNode"]);
    for (const log of items) values.add(log.entityType as AuditEntity);
    return ["ALL", ...Array.from(values).sort()] as AuditEntity[];
  }, [items]);

  const formatted = useMemo(() => items.map((log) => formatLog(log, knownNodes, knownEffects, t, { maskUnknownNodeNames })), [items, knownNodes, knownEffects, t, maskUnknownNodeNames]);
  const normalizedQuery = query.trim();

  const fetchPage = useCallback(
    async (mode: "replace" | "append", cursor?: string | null) => {
      if (mode === "replace") {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setLoadError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        if (cursor) params.set("cursor", cursor);
        if (actionFilter !== "ALL") params.set("action", actionFilter);
        if (entityFilter !== "ALL") params.set("entity", entityFilter);
        if (normalizedQuery) params.set("query", normalizedQuery);
        if (mode === "replace" && focusedAuditId) params.set("focusId", focusedAuditId);

        const response = await fetch(`/api/characters/${characterId}/audit?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to load audit history");
        const body = (await response.json()) as AuditListResponse;

        setItems((current) => mode === "append" ? dedupeAuditLogs([...current, ...body.items]) : body.items);
        if (mode === "replace") {
          setExpandedIds(focusedAuditId ? new Set([focusedAuditId]) : new Set());
        }
        setNextCursor(body.nextCursor);
        setTotal(body.total);
      } catch {
        setLoadError(t("history.loadFailed"));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [actionFilter, characterId, entityFilter, focusedAuditId, normalizedQuery, t],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (firstFilterRun.current && !focusedAuditId) {
        firstFilterRun.current = false;
        return;
      }
      firstFilterRun.current = false;
      void fetchPage("replace");
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [fetchPage, focusedAuditId]);

  useEffect(() => {
    if (!focusedAuditId) return;
    setHighlightedId(focusedAuditId);
    setExpandedIds((current) => new Set([...current, focusedAuditId]));
    window.setTimeout(() => {
      document.getElementById(`audit-${focusedAuditId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [focusedAuditId, items]);

  function activate(log: AuditLogWithActor) {
    if (log.entityType === "CharacterNode") {
      const node = knownNodes.get(log.entityId);
      if (!node) return;
      selectNode(node.id);
      setEditorMode("edit");
      openSidebarSection("node-editor", true);
      return;
    }
    if (log.entityType === "Effect") {
      openSidebarSection("effect-manager", true);
      return;
    }
    if (log.entityType === "Character" || log.entityType === "CharacterAssignment") {
      openSidebarSection("settings", true);
      return;
    }
    if (log.entityType === "EntityTemplate") {
      openSidebarSection("node-editor", true);
    }
  }

  function linkToAuditLog(logId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("audit", logId);
    window.history.replaceState(null, "", url.toString());
    setHighlightedId(logId);
    setExpandedIds((current) => new Set([...current, logId]));
    void navigator.clipboard?.writeText(url.toString());
  }

  function toggleExpanded(logId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("history.search")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value as AuditAction | "ALL")}
          >
            <option value="ALL">{t("history.allActions")}</option>
            <option value="CREATE">{t("history.create")}</option>
            <option value="UPDATE">{t("history.update")}</option>
            <option value="DELETE">{t("history.delete")}</option>
            <option value="ASSIGN">{t("history.access")}</option>
            <option value="APPLY_TEMPLATE">{t("history.templates")}</option>
            <option value="RECALCULATE">{t("history.recalculate")}</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value as AuditEntity)}
          >
            {entityOptions.map((entity) => (
              <option key={entity} value={entity}>
                {entity === "ALL" ? t("history.allEntities") : entityLabel(entity, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t("history.showing", { visible: items.length, total })}
        </span>
        {(actionFilter !== "ALL" || entityFilter !== "ALL" || normalizedQuery) && <Badge>{t("common.filtered")}</Badge>}
      </div>

      {loadError && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p>}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("history.loading")}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("history.emptyFiltered")}</p>
      ) : (
        <div className="space-y-3">
          {formatted.map((item) => {
            const canActivate = hasActivationTarget(item.log, knownNodes, knownEffects);
            const isExpanded = expandedIds.has(item.log.id);
            const hasDetails = Boolean(item.description) || item.changes.length > 0;
            return (
              <article
                id={`audit-${item.log.id}`}
                key={item.log.id}
                className={`rounded-md border p-2 text-sm transition-colors ${highlightedId === item.log.id ? "border-primary bg-primary/5 shadow-sm" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {hasDetails ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => toggleExpanded(item.log.id)}
                        title={isExpanded ? t("history.collapseRecord") : t("history.expandRecord")}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <span className="h-7 w-7 shrink-0" />
                    )}
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{actionLabel(item.log.action, t)}</Badge>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {actorLabel(item.log, t)} · <time>{new Date(item.log.createdAt).toLocaleString(language === "uk" ? "uk-UA" : "en-US")}</time>
                    </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => linkToAuditLog(item.log.id)} title={t("history.copyAuditLink")}>
                      <Link2 className="h-4 w-4" />
                    </Button>
                    {canActivate && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => activate(item.log)} title={t("history.openRelated")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {isExpanded && item.description && <p className="mt-2 pl-9 text-muted-foreground">{item.description}</p>}
                {isExpanded && item.changes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {item.changes.map((change) => (
                      <div key={change.label} className="rounded-md bg-muted/50 p-2">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">{change.label}</div>
                        <div className="flex min-w-0 items-center gap-2 text-xs">
                          <code className="min-w-0 truncate rounded bg-background px-1.5 py-0.5">{change.from}</code>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <code className="min-w-0 truncate rounded bg-background px-1.5 py-0.5">{change.to}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {nextCursor && (
        <Button type="button" variant="outline" className="w-full" disabled={isLoadingMore} onClick={() => fetchPage("append", nextCursor)}>
          {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("history.loadMore")}
        </Button>
      )}
    </div>
  );
}

function dedupeAuditLogs(logs: AuditLogWithActor[]) {
  const seen = new Set<string>();
  const result: AuditLogWithActor[] = [];
  for (const log of logs) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    result.push(log);
  }
  return result;
}

function formatLog(
  log: AuditLogWithActor,
  nodes: Map<string, CharacterNodeModel>,
  effects: Map<string, EffectDefinition>,
  t: ReturnType<typeof useI18n>["t"],
  options: { maskUnknownNodeNames: boolean },
) {
  const oldValue = asRecord(log.oldValue);
  const newValue = asRecord(log.newValue);
  const hiddenNodeLog = options.maskUnknownNodeNames && log.entityType === "CharacterNode" && !nodes.has(log.entityId);
  const entityName = hiddenNodeLog ? t("dependencies.hiddenNode") : entityDisplayName(log, oldValue, newValue, nodes, effects);
  const changes = hiddenNodeLog ? [] : diffRecords(oldValue, newValue, log.entityType, t);
  let title = `${actionVerb(log.action, t)} ${entityLabel(log.entityType, t)} ${entityName}`;
  let description = "";

  if (log.action === "APPLY_TEMPLATE") {
    const copied = Array.isArray(newValue.copiedNodeIds) ? newValue.copiedNodeIds.length : 0;
    title = t("history.appliedTemplate");
    description = copied > 0 ? t("history.copiedNodes", { count: copied }) : t("history.copiedTemplate");
  }

  if (log.entityType === "CharacterAssignment") {
    const label = stringValue(newValue.label ?? oldValue.label ?? newValue.userId ?? oldValue.userId ?? t("history.playerFallback"));
    if (newValue.removed) {
      title = t("history.removedAccess", { label });
      description = newValue.ownerCleared ? t("history.primaryCleared") : "";
    } else {
      title = t("history.grantedAccess", { label });
    }
  }

  if (log.entityType === "Character" && log.fieldPath === "archivedAt" && newValue.archivedAt === null) {
    title = t("history.restoredCharacter", { name: entityName });
  }

  if (log.entityType === "Character" && log.action === "DELETE") {
    title = t("history.archivedCharacter", { name: entityName });
  }

  if (log.entityType === "Effect") {
    const operation = stringValue(newValue.operation ?? oldValue.operation ?? effects.get(log.entityId)?.operation ?? "");
    if (operation) description = t("history.operation", { operation });
  }

  const searchText = hiddenNodeLog
    ? [title, description, log.action, log.entityType, log.fieldPath].join(" ")
    : [title, description, log.action, log.entityType, log.fieldPath, JSON.stringify(oldValue), JSON.stringify(newValue)].join(" ");
  return { log, title, description, changes, searchText };
}

function diffRecords(oldValue: Record<string, unknown>, newValue: Record<string, unknown>, entityType: string, t: ReturnType<typeof useI18n>["t"]) {
  const keys = prioritizedKeys(entityType, oldValue, newValue);
  const changes: Array<{ label: string; from: string; to: string }> = [];
  for (const key of keys) {
    const before = readPath(oldValue, key);
    const after = readPath(newValue, key);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ label: fieldLabel(key, t), from: displayValue(before, t), to: displayValue(after, t) });
  }
  return changes.slice(0, 6);
}

function prioritizedKeys(entityType: string, oldValue: Record<string, unknown>, newValue: Record<string, unknown>) {
  const base = ["name", "description", "ownerId", "enabled", "priority", "operation", "type"];
  const dataKeys = [
    ...meaningfulDataKeys(asRecord(oldValue.data)).map((key) => `data.${key}`),
    ...meaningfulDataKeys(asRecord(newValue.data)).map((key) => `data.${key}`)
  ];
  const regular = Array.from(new Set([...base, ...Object.keys(oldValue), ...Object.keys(newValue)]));
  const expanded = new Set<string>();
  for (const key of regular) {
    if (key === "data") {
      for (const dataKey of dataKeys) expanded.add(dataKey);
    } else {
      expanded.add(key);
    }
  }
  if (entityType === "CharacterAssignment") return ["label", "userId", "canView", "removed", "ownerCleared"];
  return Array.from(expanded);
}

function readPath(record: Record<string, unknown>, key: string) {
  if (!key.includes(".")) return record[key];
  const [root, child] = key.split(".");
  return asRecord(record[root])[child];
}

function meaningfulDataKeys(data: Record<string, unknown>) {
  return ["value", "current", "max", "min", "text", "description", "icon", "color"].filter((key) => key in data);
}

function displayValue(value: unknown, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === undefined) return "-";
  if (value === null) return t("history.emptyValue");
  if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (Array.isArray(value)) return t("history.items", { count: value.length });
  if (typeof value === "object") return compactJson(value);
  return String(value);
}

function compactJson(value: unknown) {
  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 80)}...` : json;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function entityDisplayName(
  log: AuditLogWithActor,
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  nodes: Map<string, CharacterNodeModel>,
  effects: Map<string, EffectDefinition>,
) {
  const direct = stringValue(newValue.name ?? oldValue.name);
  if (direct) return `«${direct}»`;
  const node = nodes.get(log.entityId);
  if (node) return `«${node.name}»`;
  const effect = effects.get(log.entityId);
  if (effect) return `«${effect.name}»`;
  return shortId(log.entityId);
}

function hasActivationTarget(log: AuditLogWithActor, nodes: Map<string, CharacterNodeModel>, effects: Map<string, EffectDefinition>) {
  if (log.entityType === "CharacterNode") return nodes.has(log.entityId);
  if (log.entityType === "Effect") return effects.has(log.entityId);
  return log.entityType === "Character" || log.entityType === "CharacterAssignment" || log.entityType === "EntityTemplate";
}

function actionVerb(action: AuditAction, t: ReturnType<typeof useI18n>["t"]) {
  if (action === "CREATE") return t("history.created");
  if (action === "UPDATE") return t("history.updated");
  if (action === "DELETE") return t("history.deleted");
  if (action === "ASSIGN") return t("history.accessChanged");
  if (action === "APPLY_TEMPLATE") return t("history.applied");
  return t("history.recalculated");
}

function actionLabel(action: AuditAction, t: ReturnType<typeof useI18n>["t"]) {
  if (action === "CREATE") return t("history.create");
  if (action === "UPDATE") return t("history.update");
  if (action === "DELETE") return t("history.delete");
  if (action === "ASSIGN") return t("history.access");
  if (action === "APPLY_TEMPLATE") return t("history.templates");
  return t("history.recalculate");
}

function entityLabel(entity: string, t: ReturnType<typeof useI18n>["t"]) {
  if (entity === "Character") return t("history.entity.character");
  if (entity === "CharacterNode") return t("history.entity.node");
  if (entity === "Effect") return t("history.entity.effect");
  if (entity === "CharacterAssignment") return t("history.entity.access");
  if (entity === "EntityTemplate") return t("history.entity.template");
  if (entity === "TemplateNode") return t("history.entity.templateNode");
  return entity;
}

function fieldLabel(key: string, t: ReturnType<typeof useI18n>["t"]) {
  if (key.startsWith("data.")) return t("history.field.data", { field: key.slice(5) });
  if (key === "ownerId") return t("history.field.ownerId");
  if (key === "canView") return t("history.field.canView");
  if (key === "ownerCleared") return t("history.field.ownerCleared");
  if (key === "removed") return t("history.field.removed");
  return key;
}

function actorLabel(log: AuditLogWithActor, t: ReturnType<typeof useI18n>["t"]) {
  return log.actor?.name ?? log.actor?.email ?? t("history.system");
}

function shortId(id: string) {
  return id.length > 8 ? `#${id.slice(-6)}` : id;
}
