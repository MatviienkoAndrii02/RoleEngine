import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePageGM } from "@/server/page-auth";
import { TemplateForm } from "@/components/templates/template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";
import { getActiveWritableWorkspace, requireUserWorkspace } from "@/server/authz";

export default async function NewTemplatePage({ params }: { params: Promise<{ workspaceId?: string }> }) {
  const workspaceId = (await params)?.workspaceId;
  const user = await requirePageGM(workspaceId ? `/workspaces/${workspaceId}/templates/new` : "/templates/new");
  const activeWorkspace = workspaceId ? null : await getActiveWritableWorkspace(user.id);
  if (!workspaceId && activeWorkspace) redirect(`/workspaces/${activeWorkspace.id}/templates/new`);
  if (workspaceId && !(await requireUserWorkspace(user.id, workspaceId)).canWrite) notFound();
  const { t } = await getTranslator();
  return <div className="mx-auto max-w-2xl space-y-5" data-workspace-context={workspaceId}><Button asChild variant="ghost"><Link href={workspaceId ? `/workspaces/${workspaceId}/templates` : "/templates"}><ArrowLeft className="h-4 w-4" />{t("template.back")}</Link></Button><Card><CardHeader><CardTitle>{t("template.new")}</CardTitle></CardHeader><CardContent><TemplateForm /></CardContent></Card></div>;
}
