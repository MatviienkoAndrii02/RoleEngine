"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronsUpDown, Crosshair, Search, X } from "lucide-react";
import { getNodeBreadcrumb, type CharacterNodeModel, type NodeType } from "@/domain/nodes";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export type NodePickerExtraOption = {
  value: string;
  label: string;
  description?: string;
};

export function NodePicker({
  name,
  nodes,
  value,
  defaultValue = "",
  onChange,
  allowedTypes,
  extraOptions = [],
  includeRoot = false,
  rootLabel,
  rootValue = "",
  placeholder,
  required = false,
  disabled = false,
  compact = false,
}: {
  name: string;
  nodes: CharacterNodeModel[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  allowedTypes?: NodeType[];
  extraOptions?: NodePickerExtraOption[];
  includeRoot?: boolean;
  rootLabel?: string;
  rootValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const reactId = useId();
  const pickerId = `${name}-${reactId}`;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(!compact);
  const currentValue = value ?? internalValue;
  const nodePickRequest = useCharacterUiStore((state) => state.nodePickRequest);
  const pickedNode = useCharacterUiStore((state) => state.pickedNode);
  const startNodePick = useCharacterUiStore((state) => state.startNodePick);
  const cancelNodePick = useCharacterUiStore((state) => state.cancelNodePick);
  const clearPickedNode = useCharacterUiStore((state) => state.clearPickedNode);
  const activePick = nodePickRequest?.pickerId === pickerId;

  const allowedNodeIds = useMemo(() => {
    if (!allowedTypes?.length) return null;
    return new Set(nodes.filter((node) => allowedTypes.includes(node.type)).map((node) => node.id));
  }, [allowedTypes, nodes]);

  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return nodes
      .filter((node) => !allowedNodeIds || allowedNodeIds.has(node.id))
      .filter((node) => {
        if (!normalized) return true;
        const description = typeof node.data.description === "string" ? node.data.description : "";
        return [node.name, node.path, node.type, description, getNodeBreadcrumb(node, nodes)].some((part) => part.toLowerCase().includes(normalized));
      });
  }, [allowedNodeIds, nodes, query]);

  const filteredExtraOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return extraOptions;
    return extraOptions.filter((option) => [option.label, option.description ?? ""].some((part) => part.toLowerCase().includes(normalized)));
  }, [extraOptions, query]);

  const selectedLabel = useMemo(() => {
    if (includeRoot && currentValue === rootValue) return rootLabel ?? t("common.rootCharacter");
    const node = nodes.find((candidate) => candidate.id === currentValue);
    if (node) return getNodeBreadcrumb(node, nodes);
    return extraOptions.find((option) => option.value === currentValue)?.label ?? "";
  }, [currentValue, extraOptions, includeRoot, nodes, rootLabel, rootValue, t]);

  useEffect(() => {
    if (value === undefined) setInternalValue(defaultValue);
  }, [defaultValue, value]);

  useEffect(() => {
    if (!pickedNode || pickedNode.pickerId !== pickerId) return;
    const node = nodes.find((candidate) => candidate.id === pickedNode.nodeId);
    if (node && (!allowedTypes?.length || allowedTypes.includes(node.type))) {
      setValue(node.id);
    }
    clearPickedNode(pickerId);
  }, [allowedTypes, clearPickedNode, nodes, pickedNode, pickerId]);

  function setValue(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    if (compact) {
      setExpanded(false);
      setQuery("");
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={currentValue} required={required} />
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {currentValue && selectedLabel ? (
            <div className="group flex h-9 w-full min-w-0 items-center rounded-md border bg-muted/40 px-3 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                disabled={disabled}
                title={selectedLabel}
                onClick={() => {
                  if (compact) setExpanded(true);
                }}
              >
                {selectedLabel}
              </button>
              <button
                type="button"
                className="hidden shrink-0 rounded text-muted-foreground hover:text-foreground group-hover:block"
                disabled={disabled}
                aria-label={t("common.clear")}
                title={t("common.clear")}
                onClick={() => setValue("")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (compact) setExpanded(true);
                }}
                placeholder={placeholder ?? t("node.pickerSearch")}
                className="pl-9"
                disabled={disabled}
              />
            </>
          )}
        </div>
        {compact && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className="shrink-0"
            title={expanded ? t("common.collapse") : t("common.expand")}
            aria-label={expanded ? t("common.collapse") : t("common.expand")}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant={activePick ? "secondary" : "outline"}
          size="icon"
          disabled={disabled}
          title={activePick ? t("node.pickCancel") : t("node.pickFromTree")}
          aria-label={activePick ? t("node.pickCancel") : t("node.pickFromTree")}
          onClick={() => activePick ? cancelNodePick() : startNodePick(pickerId, allowedTypes)}
        >
          {activePick ? <X className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
        </Button>
      </div>
      {!selectedLabel && (
        <div className="flex min-h-6 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("node.selectedNode")}:</span>
          <span>{placeholder ?? t("effect.selectNode")}</span>
        </div>
      )}
      <div className={cn("max-h-44 space-y-1 overflow-y-auto rounded-md border bg-background p-1", !expanded && "hidden")}>
        {includeRoot && rootMatches(query, rootLabel ?? t("common.rootCharacter")) && (
          <PickerOption
            label={rootLabel ?? t("common.rootCharacter")}
            selected={currentValue === rootValue}
            onClick={() => setValue(rootValue)}
          />
        )}
        {filteredExtraOptions.map((option) => (
          <PickerOption
            key={option.value}
            label={option.label}
            description={option.description}
            selected={currentValue === option.value}
            onClick={() => setValue(option.value)}
          />
        ))}
        {filteredNodes.map((node) => (
          <PickerOption
            key={node.id}
            label={getNodeBreadcrumb(node, nodes)}
            description={node.type}
            selected={currentValue === node.id}
            onClick={() => setValue(node.id)}
          />
        ))}
        {!filteredNodes.length && !filteredExtraOptions.length && !(includeRoot && rootMatches(query, rootLabel ?? t("common.rootCharacter"))) && (
          <div className="px-2 py-3 text-sm text-muted-foreground">{t("node.noPickerMatches")}</div>
        )}
      </div>
    </div>
  );
}

function PickerOption({ label, description, selected, onClick }: { label: string; description?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
        selected && "bg-primary/10 text-primary"
      )}
      onClick={onClick}
    >
      <span className="min-w-0 truncate">{label}</span>
      {description && <span className="shrink-0 text-xs uppercase text-muted-foreground">{description}</span>}
    </button>
  );
}

function rootMatches(query: string, label: string) {
  return !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase());
}
