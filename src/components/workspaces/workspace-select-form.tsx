"use client";

import type { WorkspaceRole } from "@prisma/client";
import { useId } from "react";
import { BriefcaseBusiness } from "lucide-react";
import { useI18n } from "@/i18n/client";

type WorkspaceOption = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export function WorkspaceSelectForm({
  action,
  activeWorkspaceId,
  workspaces,
}: {
  action: (formData: FormData) => void | Promise<void>;
  activeWorkspaceId: string;
  workspaces: WorkspaceOption[];
}) {
  const { t } = useI18n();
  const selectId = useId();

  return (
    <form action={action} className="flex min-w-0 items-center gap-2">
      <BriefcaseBusiness className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <label className="sr-only" htmlFor={selectId}>{t("workspace.active")}</label>
      <select
        id={selectId}
        name="workspaceId"
        defaultValue={activeWorkspaceId}
        className="h-11 max-w-36 truncate rounded-md border border-input bg-background px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:max-w-64 sm:text-sm"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} · {workspaceRoleLabel(workspace.role, t)}
          </option>
        ))}
      </select>
    </form>
  );
}

function workspaceRoleLabel(role: WorkspaceRole, t: ReturnType<typeof useI18n>["t"]) {
  if (role === "OWNER") return t("workspace.role.OWNER");
  if (role === "GM") return t("workspace.role.GM");
  return t("workspace.role.PLAYER");
}
