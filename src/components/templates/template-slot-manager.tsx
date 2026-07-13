"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { NodeType } from "@/domain/nodes";
import type { TemplateSlotDirection, TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

const nodeTypes: NodeType[] = ["NUMBER", "BAR", "TEXT", "TABLE", "CONTAINER", "GROUP"];
const directions: TemplateSlotDirection[] = ["INPUT", "OUTPUT", "BIDIRECTIONAL"];

export function TemplateSlotManager({ templateId, slots }: { templateId: string; slots: TemplateSlotModel[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = slots.find((slot) => slot.id === editingId) ?? null;

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const acceptedTypes = nodeTypes.filter((type) => formData.get(`accepted-${type}`) === "on");
    const body = {
      key: formData.get("key"),
      label: formData.get("label"),
      description: String(formData.get("description") ?? "") || undefined,
      direction: formData.get("direction"),
      acceptedTypes,
      required: formData.get("required") === "on",
    };
    const response = await fetch(editing ? `/api/templates/${templateId}/slots/${editing.id}` : `/api/templates/${templateId}/slots`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "templateSlot.saveFailed"));
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(slot: TemplateSlotModel) {
    if (!window.confirm(t("templateSlot.deleteConfirm", { label: slot.label }))) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/templates/${templateId}/slots/${slot.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "templateSlot.deleteFailed"));
      return;
    }
    if (editingId === slot.id) setEditingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("templateSlot.empty")}</p>
        ) : slots.map((slot) => (
          <div key={slot.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{slot.label}</div>
                <div className="text-xs text-muted-foreground">{slot.key} · {t(`templateSlot.direction.${slot.direction}`)} · {slot.acceptedTypes.join(", ")}</div>
                {slot.description && <p className="mt-1 text-sm text-muted-foreground">{slot.description}</p>}
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setEditingId(slot.id)} aria-label={t("templateSlot.editNamed", { label: slot.label })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form action={submit} className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium">{editing ? t("templateSlot.edit") : t("templateSlot.new")}</h4>
          {editing && <Button type="button" size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label={t("common.cancel")}><X className="h-4 w-4" /></Button>}
        </div>
        <Input name="key" required defaultValue={editing?.key ?? ""} placeholder={t("templateSlot.key")} />
        <Input name="label" required defaultValue={editing?.label ?? ""} placeholder={t("templateSlot.label")} />
        <Input name="description" defaultValue={editing?.description ?? ""} placeholder={t("common.description")} />
        <select name="direction" required defaultValue={editing?.direction ?? "INPUT"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          {directions.map((direction) => <option key={direction} value={direction}>{t(`templateSlot.direction.${direction}`)}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
          {nodeTypes.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <input name={`accepted-${type}`} type="checkbox" defaultChecked={editing ? editing.acceptedTypes.includes(type) : type === "NUMBER"} />
              {type}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="required" type="checkbox" defaultChecked={editing?.required ?? true} />
          {t("templateSlot.required")}
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {pending ? t("common.saving") : editing ? t("common.save") : t("templateSlot.add")}
          </Button>
          {editing && (
            <Button type="button" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={() => remove(editing)}>
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
