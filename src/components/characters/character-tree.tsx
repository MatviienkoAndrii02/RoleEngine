"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import type { NodeTreeItem } from "@/domain/nodes";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NodeValue } from "@/components/characters/node-value";
import { TablePreview } from "@/components/characters/table-editor";
import { getNodeIconComponent } from "@/components/characters/node-icons";
import { useI18n } from "@/i18n/client";

export function CharacterTree({ nodes, editorSectionId = "node-editor", searchable = false }: { nodes: NodeTreeItem[]; editorSectionId?: string; searchable?: boolean }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleNodes = useMemo(() => normalizedQuery ? filterNodeTree(nodes, normalizedQuery) : nodes, [nodes, normalizedQuery]);
  if (nodes.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("node.noNodes")}</div>;
  }

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("node.searchPlaceholder")}
            aria-label={t("common.search")}
          />
        </div>
      )}
      {visibleNodes.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("node.noSearchMatches")}</div>
      ) : (
        <div className="space-y-1">
          {visibleNodes.map((node) => (
            <TreeRow key={node.id} node={node} depth={0} editorSectionId={editorSectionId} forceExpanded={Boolean(normalizedQuery)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeRow({ node, depth, editorSectionId, forceExpanded }: { node: NodeTreeItem; depth: number; editorSectionId: string; forceExpanded: boolean }) {
  const { t } = useI18n();
  const { collapsedNodeIds, expandedNodeIds, selectedNodeId, toggleNode, selectNode, setEditorMode, openSidebarSection } = useCharacterUiStore();
  const collapsedByDefault = Boolean(node.data.collapsedByDefault);
  const collapsed = !forceExpanded && (collapsedByDefault ? !expandedNodeIds.has(node.id) : collapsedNodeIds.has(node.id));
  const selected = selectedNodeId === node.id;
  const hasChildren = node.children.length > 0;
  const Icon = getNodeIconComponent(node.data.icon, node.type);
  const [textExpanded, setTextExpanded] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);

  return (
    <div>
      <div
        className={cn(
          "grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-transparent py-1.5 pr-3 text-sm",
          selected ? "border-primary bg-primary/10" : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
        onClick={() => selectNode(node.id)}
      >
        <Button
          aria-label={collapsed ? t("node.expand") : t("node.collapse")}
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) toggleNode(node.id, collapsedByDefault);
          }}
        >
          {hasChildren ? collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" /> : <span className="h-4 w-4" />}
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">{node.name}</div>
            {node.data.description && <div className="truncate text-xs text-muted-foreground" title={node.data.description}>{node.data.description}</div>}
          </div>
        </div>
        <NodeValue
          node={node}
          textExpanded={textExpanded}
          onToggleText={() => setTextExpanded((value) => !value)}
          tableExpanded={tableExpanded}
          onToggleTable={() => setTableExpanded((value) => !value)}
        />
        {selected && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title={t("node.addInside")}
              aria-label={`${t("node.addInside")} ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                selectNode(node.id);
                setEditorMode("add");
                openSidebarSection(editorSectionId, true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title={t("node.edit")}
              aria-label={`${t("common.edit")} ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                selectNode(node.id);
                setEditorMode("edit");
                openSidebarSection(editorSectionId, true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {node.type === "TEXT" && "text" in node.data && textExpanded && (
        <div
          className="mb-2 mr-3 whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm leading-6"
          style={{ marginLeft: `${depth * 18 + 44}px` }}
        >
          {node.data.text}
        </div>
      )}
      {node.type === "TABLE" && "columns" in node.data && "rows" in node.data && tableExpanded && (
        <div className="mb-2 mr-3" style={{ marginLeft: `${depth * 18 + 44}px` }}>
          <TablePreview data={node.data} />
        </div>
      )}
      {!collapsed &&
        node.children.map((child) => <TreeRow key={child.id} node={child} depth={depth + 1} editorSectionId={editorSectionId} forceExpanded={forceExpanded} />)}
    </div>
  );
}

function filterNodeTree(nodes: NodeTreeItem[], query: string): NodeTreeItem[] {
  const result: NodeTreeItem[] = [];
  for (const node of nodes) {
    const matches = nodeMatches(node, query);
    const filteredChildren = filterNodeTree(node.children, query);
    if (matches) {
      result.push(node);
    } else if (filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

function nodeMatches(node: NodeTreeItem, query: string) {
  const description = typeof node.data.description === "string" ? node.data.description : "";
  const text = node.type === "TEXT" && "text" in node.data ? node.data.text : "";
  return [node.name, node.path, node.type, description, text].some((value) => value.toLowerCase().includes(query));
}
