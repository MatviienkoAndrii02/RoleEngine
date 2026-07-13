"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import { Button } from "@/components/ui/button";
import { TemplateFilterSelect, type TemplatePickerOption } from "@/components/templates/template-filter-select";
import { useI18n } from "@/i18n/client";

export function ApplyTemplateToTemplate({
  templateId,
  templates,
  nodes,
  defaultParentId,
}: {
  templateId: string;
  templates: TemplatePickerOption[];
  nodes: CharacterNodeModel[];
  defaultParentId?: string | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [parentNodeId, setParentNodeId] = useState("");
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const parentValue = nodes.some((node) => node.id === defaultParentId) ? defaultParentId ?? "" : "";

  useEffect(() => {
    setParentNodeId(parentValue);
  }, [parentValue]);

  async function submit() {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/templates/${templateId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceTemplateId,
        parentNodeId: parentNodeId || null,
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
      <TemplateFilterSelect name="sourceTemplateId" required value={sourceTemplateId} onChange={setSourceTemplateId} templates={templates} emptyLabel={t("template.choose")} />
      <select
        name="parentNodeId"
        value={parentNodeId}
        onChange={(event) => setParentNodeId(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">{t("common.rootTemplate")}</option>
        {nodes.map((node) => (
          <option key={node.id} value={node.id}>
            {breadcrumb(node, nodes)}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending || templates.length === 0 || !sourceTemplateId}>
        <CopyPlus className="h-4 w-4" />
        {pending ? t("template.copying") : t("template.addCopy")}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
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
