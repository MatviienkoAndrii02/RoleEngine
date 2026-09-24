import NewTemplatePage from "@/app/templates/new/page";

export default async function WorkspaceNewTemplatePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return NewTemplatePage({ params });
}
