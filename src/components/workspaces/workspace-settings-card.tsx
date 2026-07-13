"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/client";

type WorkspaceAction = (formData: FormData) => void | Promise<void>;

export function WorkspaceSettingsCard({
  workspace,
  updateAction,
  deleteAction,
}: {
  workspace: { id: string; name: string };
  updateAction: WorkspaceAction;
  deleteAction: WorkspaceAction;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("workspace.settings")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={updateAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <Input name="name" required maxLength={200} defaultValue={workspace.name} aria-label={t("workspace.name")} />
          <SubmitButton>
            <Save className="h-4 w-4" />
            {t("common.save")}
          </SubmitButton>
        </form>

        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm(t("workspace.deleteConfirm", { name: workspace.name }))) {
              event.preventDefault();
            }
          }}
          className="flex justify-end border-t border-border pt-4"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <SubmitButton variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
            {t("workspace.delete")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function SubmitButton({
  children,
  variant,
  className,
}: {
  children: ReactNode;
  variant?: "outline";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending}>
      {pending ? t("common.saving") : children}
    </Button>
  );
}
