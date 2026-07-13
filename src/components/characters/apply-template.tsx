"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function ApplyTemplate({
  characterId,
  templates,
  nodes,
  defaultParentId,
}: {
  characterId: string;
  templates: Array<{ id: string; name: string; kind: string; slots?: TemplateSlotModel[] }>;
  nodes: CharacterNodeModel[];
  defaultParentId?: string | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parentNodeId, setParentNodeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const parentNodes = nodes;
  const parentValue = parentNodes.some((node) => node.id === defaultParentId) ? defaultParentId ?? "" : "";
  const selectedTemplate = templates.find((template) => template.id === templateId) ?? null;

  useEffect(() => {
    setParentNodeId(parentValue);
  }, [parentValue]);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/characters/${characterId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        parentNodeId: parentNodeId || null,
        bindings: readBindings(formData, selectedTemplate?.slots ?? []),
      }),
    });
    setPending(false);
    if (!response.ok) {
      setMessage(t("template.applyFailed"));
      return;
    }
    setMessage(t("template.applySuccess"));
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-3">
      <select name="templateId" required value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="">{t("template.choose")}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} - {template.kind.toLowerCase()}
          </option>
        ))}
      </select>
      {selectedTemplate?.slots && selectedTemplate.slots.length > 0 && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-sm font-medium">{t("templateSlot.bindings")}</div>
          {selectedTemplate.slots.map((slot) => {
            const options = nodes.filter((node) => slot.acceptedTypes.length === 0 || slot.acceptedTypes.includes(node.type));
            return (
              <label key={slot.id} className="block space-y-1 text-sm">
                <span>{slot.label}{slot.required ? " *" : ""}</span>
                <select name={`binding-${slot.id}`} required={slot.required} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t("templateSlot.chooseBinding")}</option>
                  {options.map((node) => <option key={node.id} value={node.id}>{breadcrumb(node, nodes)}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}
      <select
        name="parentNodeId"
        value={parentNodeId}
        onChange={(event) => setParentNodeId(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">{t("common.rootCharacter")}</option>
        {parentNodes.map((node) => (
          <option key={node.id} value={node.id}>
            {breadcrumb(node, nodes)}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending || templates.length === 0 || !templateId}>
        <CopyPlus className="h-4 w-4" />
        {pending ? t("template.copying") : t("template.addCopy")}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}

function readBindings(formData: FormData, slots: TemplateSlotModel[]) {
  const bindings: Record<string, string> = {};
  for (const slot of slots) {
    const value = String(formData.get(`binding-${slot.id}`) ?? "");
    if (value) bindings[slot.id] = value;
  }
  return bindings;
}

function breadcrumb(node: CharacterNodeModel, nodes: CharacterNodeModel[]) {
  const names = [node.name];
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}
