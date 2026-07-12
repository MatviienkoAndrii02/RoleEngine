import Link from "next/link";
import { BriefcaseBusiness, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveWorkspace, getUserWorkspaces } from "@/server/authz";
import { selectWorkspace } from "@/server/actions/workspaces";
import { getTranslator } from "@/i18n/server";
import { WorkspaceSelectForm } from "@/components/workspaces/workspace-select-form";

export async function WorkspaceSwitcher({ userId }: { userId: string }) {
  const { t } = await getTranslator();
  const [workspaces, activeWorkspace] = await Promise.all([
    getUserWorkspaces(userId),
    getActiveWorkspace(userId),
  ]);

  if (!workspaces.length || !activeWorkspace) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/workspaces">
          <BriefcaseBusiness className="h-4 w-4" />
          {t("workspace.create")}
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <WorkspaceSelectForm action={selectWorkspace} activeWorkspaceId={activeWorkspace.id} workspaces={workspaces} />
      <Button asChild variant="ghost" size="icon" title={t("workspace.manage")} aria-label={t("workspace.manage")}>
        <Link href="/workspaces">
          <SlidersHorizontal className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
