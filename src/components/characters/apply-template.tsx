"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import type { TemplateSlotModel } from "@/domain/template-slots";
import { Button } from "@/components/ui/button";
import { NodePicker } from "@/components/characters/node-picker";
import { useI18n } from "@/i18n/client";
import { TemplateFilterSelect, type TemplatePickerOption } from "@/components/templates/template-filter-select";

export function ApplyTemplate({
  characterId,
  templates,
  nodes,
  defaultParentId,
}: {
  characterId: string;
  templates: Array<TemplatePickerOption & { slots?: TemplateSlotModel[] }>;
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
      <TemplateFilterSelect name="templateId" required value={templateId} onChange={setTemplateId} templates={templates} emptyLabel={t("template.choose")} />
      {selectedTemplate?.slots && selectedTemplate.slots.length > 0 && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-sm font-medium">{t("templateSlot.bindings")}</div>
          {selectedTemplate.slots.map((slot) => {
            const options = nodes.filter((node) => slot.acceptedTypes.length === 0 || slot.acceptedTypes.includes(node.type));
            return (
              <label key={slot.id} className="block space-y-1 text-sm">
                <span>{slot.label}{slot.required ? " *" : ""}</span>
                <NodePicker
                  name={`binding-${slot.id}`}
                  nodes={options}
                  allowedTypes={slot.acceptedTypes}
                  required={slot.required}
                  placeholder={t("templateSlot.chooseBinding")}
                />
              </label>
            );
          })}
        </div>
      )}
      <NodePicker
        name="parentNodeId"
        nodes={parentNodes}
        value={parentNodeId}
        onChange={setParentNodeId}
        includeRoot
        rootLabel={t("common.rootCharacter")}
        placeholder={t("node.parent")}
      />
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
