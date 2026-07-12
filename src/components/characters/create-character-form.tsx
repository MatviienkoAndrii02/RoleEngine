"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type Option = { id: string; name: string };

export function CreateCharacterForm({ players, templates, defaultTemplateId }: {
  players: Option[];
  templates: Option[];
  defaultTemplateId?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description") || undefined,
        ownerId: formData.get("ownerId") || undefined,
        templateId: formData.get("templateId") || undefined
      })
    });
    if (!response.ok) {
      setError(await localizedApiError(response, t, "createCharacter.failed"));
      setPending(false);
      return;
    }
    const character = (await response.json()) as { id: string };
    router.push(`/characters/${character.id}`);
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-5">
      <Field label={t("createCharacter.name")} name="name" required placeholder="Mira Vale" />
      <Field label={t("common.description")} name="description" placeholder={t("createCharacter.descriptionPlaceholder")} />
      <SelectField label={t("createCharacter.assignTo")} name="ownerId" options={players} emptyLabel={t("settings.noPlayer")} />
      <SelectField label={t("createCharacter.initialStructure")} name="templateId" options={templates} emptyLabel={t("createCharacter.fromScratch")} defaultValue={defaultTemplateId} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        <UserPlus className="h-4 w-4" />
        {pending ? t("createCharacter.creating") : t("createCharacter.submit")}
      </Button>
    </form>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  return <div className="space-y-2"><label className="text-sm font-medium" htmlFor={props.name}>{label}</label><Input id={props.name} {...props} /></div>;
}

function SelectField({ label, name, options, emptyLabel, defaultValue }: {
  label: string; name: string; options: Option[]; emptyLabel: string; defaultValue?: string;
}) {
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={name}>{label}</label>
    <select id={name} name={name} defaultValue={defaultValue ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
      <option value="">{emptyLabel}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </div>;
}
