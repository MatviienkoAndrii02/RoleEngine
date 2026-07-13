"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { TEMPLATE_TAG_COLOR_NAMES, templateTagColorClass, type TemplateTagColorName, type TemplateTagModel } from "@/domain/template-tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

export function TemplateTagManager({
  templateId,
  assignedTags,
  allTags,
}: {
  templateId: string;
  assignedTags: TemplateTagModel[];
  allTags: TemplateTagModel[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const assignedIds = useMemo(() => new Set(assignedTags.map((tag) => tag.id)), [assignedTags]);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TemplateTagColorName>("gray-soft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredTags = allTags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function request(url: string, options: RequestInit, fallbackKey: Parameters<typeof t>[0]) {
    setPending(url);
    setError(null);
    const response = await fetch(url, options);
    setPending(null);
    if (!response.ok) {
      setError(await localizedApiError(response, t, fallbackKey));
      return false;
    }
    router.refresh();
    return true;
  }

  async function createTag() {
    const name = newName.trim();
    if (!name) return;
    const ok = await request(`/api/templates/${templateId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: newColor }),
    }, "templateTag.saveFailed");
    if (ok) setNewName("");
  }

  async function assign(tagId: string) {
    await request(`/api/templates/${templateId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    }, "templateTag.assignFailed");
  }

  async function unassign(tagId: string) {
    await request(`/api/templates/${templateId}/tags/${tagId}`, { method: "DELETE" }, "templateTag.unassignFailed");
  }

  async function removeTag(tag: TemplateTagModel) {
    if (!window.confirm(t("templateTag.deleteConfirm", { name: tag.name }))) return;
    await request(`/api/templates/${templateId}/tags/${tag.id}?permanent=1`, { method: "DELETE" }, "templateTag.deleteFailed");
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="text-sm font-medium">{t("templateTag.assigned")}</div>
        {assignedTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("templateTag.noneAssigned")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignedTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                disabled={pending !== null}
                onClick={() => unassign(tag.id)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${templateTagColorClass(tag.color)}`}
                title={t("templateTag.removeFromTemplate")}
              >
                {tag.name}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="text-sm font-medium">{t("templateTag.create")}</div>
        <Input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={200} placeholder={t("templateTag.namePlaceholder")} />
        <ColorPicker value={newColor} onChange={setNewColor} />
        <Button type="button" size="sm" disabled={pending !== null || !newName.trim()} onClick={createTag}>
          <Plus className="h-4 w-4" />
          {t("templateTag.createAndAdd")}
        </Button>
      </section>

      <section className="space-y-3">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("templateTag.searchPlaceholder")} />
        <div className="space-y-2">
          {filteredTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("templateTag.noSearchResults")}</p>
          ) : filteredTags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              assigned={assignedIds.has(tag.id)}
              editing={editingId === tag.id}
              pending={pending !== null}
              onEdit={() => setEditingId(tag.id)}
              onCancel={() => setEditingId(null)}
              onAssign={() => assign(tag.id)}
              onDelete={() => removeTag(tag)}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
              templateId={templateId}
            />
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function TagRow({
  tag,
  assigned,
  editing,
  pending,
  templateId,
  onEdit,
  onCancel,
  onAssign,
  onDelete,
  onSaved,
}: {
  tag: TemplateTagModel;
  assigned: boolean;
  editing: boolean;
  pending: boolean;
  templateId: string;
  onEdit: () => void;
  onCancel: () => void;
  onAssign: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<TemplateTagColorName>(tag.color);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const response = await fetch(`/api/templates/${templateId}/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (!response.ok) {
      setError(await localizedApiError(response, t, "templateTag.saveFailed"));
      return;
    }
    onSaved();
  }

  if (editing) {
    return (
      <div className="space-y-3 rounded-md border border-border p-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending || !name.trim()} onClick={save}>
            <Check className="h-4 w-4" />
            {t("common.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
            <X className="h-4 w-4" />
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${templateTagColorClass(tag.color)}`}>{tag.name}</span>
      {assigned ? (
        <span className="text-xs text-muted-foreground">{t("templateTag.alreadyAssigned")}</span>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onAssign}>
          <Plus className="h-4 w-4" />
          {t("templateTag.addToTemplate")}
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onEdit}>
        <Pencil className="h-4 w-4" />
        {t("common.edit")}
      </Button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: TemplateTagColorName; onChange: (value: TemplateTagColorName) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {TEMPLATE_TAG_COLOR_NAMES.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`min-h-9 rounded-md border px-2 text-xs font-medium outline-offset-2 ${templateTagColorClass(color)} ${value === color ? "outline outline-2 outline-ring" : ""}`}
          aria-label={t("templateTag.colorOption", { color })}
        >
          Aa
        </button>
      ))}
    </div>
  );
}
