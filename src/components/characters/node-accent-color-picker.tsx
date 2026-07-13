"use client";

import { useState } from "react";
import { TEMPLATE_TAG_COLOR_NAMES, templateTagColorClass, type TemplateTagColorName } from "@/domain/template-tags";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

type NodeAccentColorValue = TemplateTagColorName | "";

export function NodeAccentColorPicker({
  name = "accentColor",
  defaultValue,
}: {
  name?: string;
  defaultValue?: string | null;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<NodeAccentColorValue>(parseNodeAccentColor(defaultValue));

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t("node.accentColor")}</div>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => setValue("")}
          className={cn(
            "min-h-9 rounded-md border bg-background px-2 text-xs font-medium outline-offset-2",
            value === "" && "outline outline-2 outline-ring"
          )}
          aria-label={t("node.noAccentColor")}
        >
          {t("node.noAccentColor")}
        </button>
        {TEMPLATE_TAG_COLOR_NAMES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setValue(color)}
            className={cn(
              "min-h-9 rounded-md border px-2 text-xs font-medium outline-offset-2",
              templateTagColorClass(color),
              value === color && "outline outline-2 outline-ring"
            )}
            aria-label={t("node.accentColorOption", { color })}
          >
            Aa
          </button>
        ))}
      </div>
    </div>
  );
}

function parseNodeAccentColor(value: string | null | undefined): NodeAccentColorValue {
  return TEMPLATE_TAG_COLOR_NAMES.includes(value as TemplateTagColorName) ? value as TemplateTagColorName : "";
}
