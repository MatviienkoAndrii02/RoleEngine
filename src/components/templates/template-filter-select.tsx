"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { templateTagColorClass, type TemplateTagModel } from "@/domain/template-tags";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export type TemplatePickerOption = {
  id: string;
  name: string;
  tags: TemplateTagModel[];
};

export function TemplateFilterSelect({
  name,
  templates,
  value,
  defaultValue,
  emptyLabel,
  required,
  onChange,
}: {
  name: string;
  templates: TemplatePickerOption[];
  value?: string;
  defaultValue?: string;
  emptyLabel: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const { t } = useI18n();
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [templateQuery, setTemplateQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const selectedValue = value ?? internalValue;

  const tags = useMemo(() => {
    const byId = new Map<string, TemplateTagModel>();
    for (const template of templates) {
      for (const tag of template.tags) byId.set(tag.id, tag);
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [templates]);

  const filteredTagOptions = tags.filter((tag) => tag.name.toLowerCase().includes(tagQuery.trim().toLowerCase()));
  const filteredTemplates = templates.filter((template) => {
    const query = templateQuery.trim().toLowerCase();
    const matchesName = !query || template.name.toLowerCase().includes(query);
    const tagIds = new Set(template.tags.map((tag) => tag.id));
    const matchesTags = selectedTagIds.every((tagId) => tagIds.has(tagId));
    return matchesName && matchesTags;
  });

  function update(value: string) {
    setInternalValue(value);
    onChange?.(value);
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) => current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={selectedValue} />
      <Input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder={t("template.searchByName")} />
      {tags.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <Input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder={t("templateTag.searchPlaceholder")} />
          <div className="flex flex-wrap gap-1.5">
            {filteredTagOptions.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t("templateTag.noSearchResults")}</span>
            ) : filteredTagOptions.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${templateTagColorClass(tag.color)} ${active ? "outline outline-2 outline-ring" : ""}`}
                >
                  {tag.name}
                  {active && <X className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
          {selectedTagIds.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTagIds([])}>
              {t("template.clearTagFilters")}
            </Button>
          )}
        </div>
      )}
      <select
        required={required}
        value={selectedValue}
        onChange={(event) => update(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">{emptyLabel}</option>
        {filteredTemplates.map((template) => (
          <option key={template.id} value={template.id}>{template.name}</option>
        ))}
      </select>
      {filteredTemplates.length === 0 && <p className="text-sm text-muted-foreground">{t("template.noSearchResults")}</p>}
    </div>
  );
}
