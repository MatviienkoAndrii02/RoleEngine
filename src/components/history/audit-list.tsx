"use client";

import { useMemo, useState } from "react";
import type { AuditAction, AuditLog } from "@prisma/client";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { EffectDefinition } from "@/domain/effects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";
import { useCharacterUiStore } from "@/store/character-ui-store";

const PAGE_SIZE = 10;

type AuditLogWithActor = AuditLog & {
  actor?: { name: string | null; email: string } | null;
};

type AuditEntity = "ALL" | "Character" | "CharacterNode" | "Effect" | "CharacterAssignment" | "EntityTemplate" | "TemplateNode";

export function AuditList({
  logs,
  nodes = [],
  effects = [],
}: {
  logs: AuditLogWithActor[];
  nodes?: CharacterNodeModel[];
  effects?: EffectDefinition[];
}) {
  const { language, t } = useI18n();
  const [actionFilter, setActionFilter] = useState<AuditAction | "ALL">("ALL");
  const [entityFilter, setEntityFilter] = useState<AuditEntity>("ALL");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const openSidebarSection = useCharacterUiStore((state) => state.openSidebarSection);
  const selectNode = useCharacterUiStore((state) => state.selectNode);
  const setEditorMode = useCharacterUiStore((state) => state.setEditorMode);

  const knownNodes = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const knownEffects = useMemo(() => new Map(effects.map((effect) => [effect.id, effect])), [effects]);
  const entityOptions = useMemo(() => {
    const values = new Set<AuditEntity>();
    for (const log of logs) values.add(log.entityType as AuditEntity);
    return ["ALL", ...Array.from(values).sort()] as AuditEntity[];
  }, [logs]);

  const formatted = useMemo(() => logs.map((log) => formatLog(log, knownNodes, knownEffects, t)), [logs, knownNodes, knownEffects, t]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = formatted.filter((item) => {
    if (actionFilter !== "ALL" && item.log.action !== actionFilter) return false;
    if (entityFilter !== "ALL" && item.log.entityType !== entityFilter) return false;
    if (!normalizedQuery) return true;
    return item.searchText.toLowerCase().includes(normalizedQuery);
  });
  const visible = filtered.slice(0, visibleCount);

  function activate(log: AuditLog) {
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
      openSidebarSection("apply-template", true);
    }
  }

  function resetVisible() {
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetVisible();
            }}
            placeholder={t("history.search")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value as AuditAction | "ALL");
              resetVisible();
            }}
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
            onChange={(event) => {
              setEntityFilter(event.target.value as AuditEntity);
              resetVisible();
            }}
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
          {t("history.showing", { visible: visible.length, total: filtered.length })}
        </span>
        {(actionFilter !== "ALL" || entityFilter !== "ALL" || normalizedQuery) && <Badge>{t("common.filtered")}</Badge>}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("history.emptyFiltered")}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const canActivate = hasActivationTarget(item.log, knownNodes, knownEffects);
            return (
              <article key={item.log.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{actionLabel(item.log.action, t)}</Badge>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {actorLabel(item.log, t)} · <time>{new Date(item.log.createdAt).toLocaleString(language === "uk" ? "uk-UA" : "en-US")}</time>
                    </div>
                  </div>
                  {canActivate && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => activate(item.log)} title={t("history.openRelated")}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {item.description && <p className="mt-2 text-muted-foreground">{item.description}</p>}
                {item.changes.length > 0 && (
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

      {visibleCount < filtered.length && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>
          {t("history.loadMore")}
        </Button>
      )}
    </div>
  );
}

function formatLog(log: AuditLogWithActor, nodes: Map<string, CharacterNodeModel>, effects: Map<string, EffectDefinition>, t: ReturnType<typeof useI18n>["t"]) {
  const oldValue = asRecord(log.oldValue);
  const newValue = asRecord(log.newValue);
  const entityName = entityDisplayName(log, oldValue, newValue, nodes, effects);
  const changes = diffRecords(oldValue, newValue, log.entityType, t);
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

  const searchText = [title, description, log.action, log.entityType, log.fieldPath, JSON.stringify(oldValue), JSON.stringify(newValue)].join(" ");
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
  log: AuditLog,
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

function hasActivationTarget(log: AuditLog, nodes: Map<string, CharacterNodeModel>, effects: Map<string, EffectDefinition>) {
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
