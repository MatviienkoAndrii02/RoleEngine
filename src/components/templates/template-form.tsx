"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

const kinds = ["CHARACTER", "ITEM", "SKILL", "PASSIVE_TALENT", "MUTATION", "BODY_PART", "OTHER"] as const;

export function TemplateForm({ template }: { template?: { id: string; name: string; description: string | null; kind: string; isDefaultCharacter: boolean } }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const payload = {
      name: formData.get("name"),
      description: formData.get("description"),
      kind: formData.get("kind"),
      isDefaultCharacter: formData.get("isDefaultCharacter") === "on"
    };
    const response = await fetch(template ? `/api/templates/${template.id}` : "/api/templates", {
      method: template ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template ? { name: payload.name, description: payload.description, isDefaultCharacter: payload.isDefaultCharacter } : payload)
    });
    setPending(false);
    if (!response.ok) return setError(await localizedApiError(response, t, "template.saveFailed"));
    const saved = (await response.json()) as { id: string };
    if (!template) router.push(`/templates/${saved.id}`);
    router.refresh();
  }

  async function archive() {
    if (!template || !window.confirm(t("template.archiveConfirm", { name: template.name }))) return;
    setPending(true);
    const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    if (response.ok) router.push("/templates");
    else { setPending(false); setError(await localizedApiError(response, t, "template.archiveFailed")); }
  }

  return <form action={submit} className="space-y-4">
    <Field label={t("common.name")} name="name" required defaultValue={template?.name} />
    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="template-description">{t("common.description")}</label><textarea id="template-description" name="description" defaultValue={template?.description ?? ""} className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm" /></div>
    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="kind">{t("template.kind")}</label><select id="kind" name="kind" defaultValue={template?.kind ?? "ITEM"} disabled={Boolean(template)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{kinds.map((kind) => <option key={kind} value={kind}>{templateKindLabel(kind, t)}</option>)}</select></div>
    {(template?.kind === "CHARACTER" || !template) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefaultCharacter" defaultChecked={template?.isDefaultCharacter} />{t("template.globalDefault")}</label>}
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="flex w-full flex-wrap gap-2"><Button type="submit" disabled={pending}><Save className="h-4 w-4" />{pending ? t("common.saving") : t("common.save")}</Button>{template && !template.isDefaultCharacter && <Button type="button" variant="outline" className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10" disabled={pending} onClick={archive}><Trash2 className="h-4 w-4" />{t("common.archive")}</Button>}</div>
  </form>;
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  return <div className="space-y-2"><label className="text-sm font-medium" htmlFor={props.name}>{label}</label><Input id={props.name} {...props} /></div>;
}

function templateKindLabel(kind: (typeof kinds)[number], t: ReturnType<typeof useI18n>["t"]) {
  return t(`template.kind.${kind}` as Parameters<typeof t>[0]);
}
