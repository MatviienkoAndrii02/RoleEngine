import DashboardPage from "@/app/page";

export default async function WorkspaceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ forbidden?: string; q?: string; owner?: string; sort?: string; page?: string }>;
}) {
  return DashboardPage({ params, searchParams });
}
