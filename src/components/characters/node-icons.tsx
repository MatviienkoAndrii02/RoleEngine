"use client";

import { useMemo, useState } from "react";
import {
  Backpack,
  BookOpen,
  Brain,
  CircleDot,
  Cog,
  Droplets,
  Flame,
  Folder,
  Gem,
  HeartPulse,
  Package,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Table2,
  Type,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NODE_ICON_NAMES, type NodeIconName, type NodeType } from "@/domain/nodes";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

const iconComponents = {
  circle: CircleDot,
  folder: Folder,
  table: Table2,
  text: Type,
  heart: HeartPulse,
  shield: Shield,
  swords: Swords,
  backpack: Backpack,
  sparkles: Sparkles,
  book: BookOpen,
  user: User,
  brain: Brain,
  zap: Zap,
  flame: Flame,
  droplets: Droplets,
  package: Package,
  gem: Gem,
  skull: Skull,
  cog: Cog,
  star: Star,
} satisfies Record<NodeIconName, LucideIcon>;

const defaultIconsByType = {
  NUMBER: "circle",
  BAR: "heart",
  TEXT: "text",
  TABLE: "table",
  CONTAINER: "folder",
  GROUP: "folder",
} satisfies Record<NodeType, NodeIconName>;

export function getNodeIconName(icon: unknown, type: NodeType): NodeIconName {
  return isNodeIconName(icon) ? icon : defaultIconsByType[type];
}

export function getNodeIconComponent(icon: unknown, type: NodeType): LucideIcon {
  return iconComponents[getNodeIconName(icon, type)];
}

export function NodeIconPicker({ name = "icon", type, defaultValue }: { name?: string; type: NodeType; defaultValue?: unknown }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<NodeIconName>(getNodeIconName(defaultValue, type));
  const iconLabels = useMemo(() => getIconLabels(t), [t]);
  const selectedLabel = iconLabels[selected];

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium">{t("icons.label")}</label>
        <span className="text-xs text-muted-foreground">{t("icons.current", { label: selectedLabel })}</span>
      </div>
      <div className="flex flex-wrap gap-3 rounded-md border bg-muted/20 p-2">
        {NODE_ICON_NAMES.map((iconName) => {
          const Icon = iconComponents[iconName];
          const active = selected === iconName;
          return (
            <Button
              key={iconName}
              type="button"
              size="icon"
              variant={active ? "secondary" : "outline"}
              className={cn("h-9 w-9 shrink-0", active && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
              title={iconLabels[iconName]}
              aria-label={iconLabels[iconName]}
              aria-pressed={active}
              onClick={() => setSelected(iconName)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function isNodeIconName(value: unknown): value is NodeIconName {
  return typeof value === "string" && (NODE_ICON_NAMES as readonly string[]).includes(value);
}

function getIconLabels(t: ReturnType<typeof useI18n>["t"]): Record<NodeIconName, string> {
  return {
    circle: t("icons.circle"),
    folder: t("icons.folder"),
    table: t("icons.table"),
    text: t("icons.text"),
    heart: t("icons.heart"),
    shield: t("icons.shield"),
    swords: t("icons.swords"),
    backpack: t("icons.backpack"),
    sparkles: t("icons.sparkles"),
    book: t("icons.book"),
    user: t("icons.user"),
    brain: t("icons.brain"),
    zap: t("icons.zap"),
    flame: t("icons.flame"),
    droplets: t("icons.droplets"),
    package: t("icons.package"),
    gem: t("icons.gem"),
    skull: t("icons.skull"),
    cog: t("icons.cog"),
    star: t("icons.star"),
  };
}
