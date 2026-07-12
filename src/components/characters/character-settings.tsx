"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Save, UserMinus, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";

type PlayerOption = {
  id: string;
  name: string | null;
  email: string;
};

type CharacterSettingsValue = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  assignments: PlayerOption[];
};

export function CharacterSettings({ character, players }: { character: CharacterSettingsValue; players: PlayerOption[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description") || null,
        ownerId: formData.get("ownerId") || null,
      }),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "settings.saveFailed"));
      return;
    }
    router.refresh();
  }

  async function archive() {
    if (!window.confirm(t("settings.archiveConfirm", { name: character.name }))) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/characters/${character.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "settings.archiveFailed"));
      return;
    }
    router.push("/");
    router.refresh();
  }

  function reset() {
    setError(null);
    setRevision((value) => value + 1);
  }

  async function addAssignment(formData: FormData) {
    const userId = String(formData.get("userId") ?? "");
    if (!userId) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/characters/${character.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "settings.addAccessFailed"));
      return;
    }
    router.refresh();
  }

  async function removeAssignment(player: PlayerOption) {
    if (!window.confirm(t("settings.removeAccessConfirm", { name: player.name ?? player.email }))) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/characters/${character.id}/assignments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: player.id }),
    });
    setPending(false);
    if (!response.ok) {
      setError(await localizedApiError(response, t, "settings.removeAccessFailed"));
      return;
    }
    router.refresh();
  }

  const assignedIds = new Set(character.assignments.map((player) => player.id));
  const availablePlayers = players.filter((player) => !assignedIds.has(player.id));

  return (
    <div>
        <form key={revision} action={submit} className="space-y-4">
          <Field label={t("common.name")} name="name" required defaultValue={character.name} />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="character-description">{t("common.description")}</label>
            <textarea
              id="character-description"
              name="description"
              defaultValue={character.description ?? ""}
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ownerId">{t("settings.primaryPlayer")}</label>
            <select
              id="ownerId"
              name="ownerId"
              defaultValue={character.ownerId ?? ""}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("settings.noPlayer")}</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.name ?? player.email}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex w-full flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? t("common.saving") : t("common.save")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={reset}>
              <X className="h-4 w-4" />
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={pending}
              onClick={archive}
            >
              <Archive className="h-4 w-4" />
              {t("common.archive")}
            </Button>
          </div>
        </form>

        <div className="mt-6 border-t pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{t("settings.accessTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("settings.accessHint")}</p>
            </div>
          </div>

          <div className="space-y-2">
            {character.assignments.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("settings.noAssignedPlayers")}</p>
            ) : (
              character.assignments.map((player) => (
                <div key={player.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{player.name ?? player.email}</div>
                    {player.name && <div className="truncate text-xs text-muted-foreground">{player.email}</div>}
                  </div>
                  {character.ownerId === player.id && <Badge>{t("settings.primary")}</Badge>}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={pending}
                    onClick={() => removeAssignment(player)}
                    title={t("settings.removeAccess")}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <form action={addAssignment} className="mt-3 flex gap-2">
            <select
              name="userId"
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              disabled={pending || availablePlayers.length === 0}
              defaultValue=""
            >
              <option value="">{availablePlayers.length === 0 ? t("settings.allPlayersAssigned") : t("settings.addPlayer")}</option>
              {availablePlayers.map((player) => (
                <option key={player.id} value={player.id}>{player.name ?? player.email}</option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={pending || availablePlayers.length === 0}>
              <UserPlus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          </form>
        </div>
    </div>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={props.name}>{label}</label>
      <Input id={props.name} {...props} />
    </div>
  );
}
