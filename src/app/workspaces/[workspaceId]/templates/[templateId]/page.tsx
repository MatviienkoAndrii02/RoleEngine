import TemplatePage from "@/app/templates/[templateId]/page";

export default async function WorkspaceTemplatePage({ params }: { params: Promise<{ workspaceId: string; templateId: string }> }) {
  return TemplatePage({ params });
}
