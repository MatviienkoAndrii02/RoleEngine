"use client";

import type { WorkspaceRole } from "@prisma/client";
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

  return (
    <form action={action} className="flex items-center gap-2">
      <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
      <label className="sr-only" htmlFor="active-workspace">{t("workspace.active")}</label>
      <select
        id="active-workspace"
        name="workspaceId"
        defaultValue={activeWorkspaceId}
        className="h-9 max-w-64 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
