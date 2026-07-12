"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import type { CharacterNodeModel } from "@/domain/nodes";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function ApplyTemplate({ characterId, templates, nodes }: { characterId: string; templates: Array<{ id: string; name: string; kind: string }>; nodes: CharacterNodeModel[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setPending(true); setMessage(null);
    const response = await fetch(`/api/characters/${characterId}/templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: formData.get("templateId"), parentNodeId: formData.get("parentNodeId") || null }) });
    setPending(false);
    if (!response.ok) return setMessage(t("template.applyFailed"));
    setMessage(t("template.applySuccess"));
    router.refresh();
  }
  return <form action={submit} className="space-y-3"><select name="templateId" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("template.choose")}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.kind.toLowerCase()}</option>)}</select><select name="parentNodeId" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("common.rootCharacter")}</option>{nodes.filter((node) => node.type === "CONTAINER" || node.type === "GROUP").map((node) => <option key={node.id} value={node.id}>{breadcrumb(node, nodes)}</option>)}</select><Button type="submit" disabled={pending || templates.length === 0}><CopyPlus className="h-4 w-4" />{pending ? t("template.copying") : t("template.addCopy")}</Button>{message && <p className="text-sm text-muted-foreground">{message}</p>}</form>;
}

function breadcrumb(node: CharacterNodeModel, nodes: CharacterNodeModel[]) {
  const names = [node.name];
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}
