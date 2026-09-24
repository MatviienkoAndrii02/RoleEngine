import TemplatesPage from "@/app/templates/page";

export default async function WorkspaceTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ archived?: string }>;
}) {
  return TemplatesPage({ params, searchParams });
}
