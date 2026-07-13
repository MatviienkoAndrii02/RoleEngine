"use client";

import { BookOpen, ChevronDown, ChevronUp, ExternalLink, LinkIcon, Table2 } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

const INLINE_TEXT_LIMIT = 60;

export function NodeValue({
  node,
  textExpanded = false,
  onToggleText,
  tableExpanded = false,
  onToggleTable,
}: {
  node: CharacterNodeModel;
  textExpanded?: boolean;
  onToggleText?: () => void;
  tableExpanded?: boolean;
  onToggleTable?: () => void;
}) {
  const { t } = useI18n();
  const revealNode = useCharacterUiStore((state) => state.revealNode);

  if (node.type === "NUMBER" && "value" in node.data) {
    return <span className="tabular-nums">{formatNodeNumber(node.data.value)}</span>;
  }

  if (node.type === "BAR" && "current" in node.data) {
    return (
      <span className="tabular-nums">
        {formatNodeNumber(node.data.current)}/{formatNodeNumber(node.data.max)}
      </span>
    );
  }

  if (node.type === "TEXT" && "text" in node.data) {
    if (!node.data.text) return <span className="text-muted-foreground">{t("common.empty")}</span>;
    const preview = compactText(node.data.text);
    const canShowInline = preview.length <= INLINE_TEXT_LIMIT && !hasLineBreak(node.data.text);
    if (canShowInline) {
      return (
        <span className="max-w-[min(34rem,45vw)] truncate text-sm text-muted-foreground" title={node.data.text}>
          {preview}
        </span>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-expanded={textExpanded}
        onClick={(event) => {
          event.stopPropagation();
          onToggleText?.();
        }}
      >
        <BookOpen className="h-4 w-4" />
        <span className="hidden sm:inline">{textExpanded ? t("common.collapse") : t("common.read")}</span>
        {textExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
    );
  }

  if (node.type === "TABLE" && "rows" in node.data) {
    const columns = Array.isArray(node.data.columns) ? node.data.columns.length : 0;
    const rows = Array.isArray(node.data.rows) ? node.data.rows.length : 0;
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-expanded={tableExpanded}
        onClick={(event) => {
          event.stopPropagation();
          onToggleTable?.();
        }}
      >
        <Table2 className="h-4 w-4" />
        <span className="hidden sm:inline">{rows} x {columns}</span>
        {tableExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
    );
  }

  if (node.type === "LINK" && node.resolvedLink) {
    const link = node.resolvedLink;
    if (!link.available) {
      return <span className="text-sm text-muted-foreground">{link.label}</span>;
    }
    if (link.kind === "character") {
      return (
        <Button type="button" size="sm" variant="ghost" asChild onClick={(event) => event.stopPropagation()}>
          <a href={link.href} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">{t("node.goTo")}</span>
          </a>
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          revealNode(link.nodeId, link.ancestorIds);
          window.setTimeout(() => document.getElementById(`node-row-${link.nodeId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        }}
      >
        <LinkIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{t("node.goTo")}</span>
      </Button>
    );
  }

  return <Badge>{node.type.toLowerCase()}</Badge>;
}

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasLineBreak(value: string) {
  return value.includes("\n") || value.includes("\r");
}

function formatNodeNumber(value: number) {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
