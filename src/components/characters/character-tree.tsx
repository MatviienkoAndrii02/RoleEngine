"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import type { NodeTreeItem } from "@/domain/nodes";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NodeValue } from "@/components/characters/node-value";
import { TablePreview } from "@/components/characters/table-editor";
import { getNodeIconComponent } from "@/components/characters/node-icons";
import { useI18n } from "@/i18n/client";

export function CharacterTree({ nodes, editorSectionId = "node-editor" }: { nodes: NodeTreeItem[]; editorSectionId?: string }) {
  const { t } = useI18n();
  if (nodes.length === 0) {
    return <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("node.noNodes")}</div>;
  }

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} editorSectionId={editorSectionId} />
      ))}
    </div>
  );
}

function TreeRow({ node, depth, editorSectionId }: { node: NodeTreeItem; depth: number; editorSectionId: string }) {
  const { t } = useI18n();
  const { collapsedNodeIds, selectedNodeId, toggleNode, selectNode, setEditorMode, openSidebarSection } = useCharacterUiStore();
  const collapsed = collapsedNodeIds.has(node.id);
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
            if (hasChildren) toggleNode(node.id);
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
        node.children.map((child) => <TreeRow key={child.id} node={child} depth={depth + 1} editorSectionId={editorSectionId} />)}
    </div>
  );
}
