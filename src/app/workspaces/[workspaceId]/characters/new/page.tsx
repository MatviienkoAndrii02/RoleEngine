import NewCharacterPage from "@/app/characters/new/page";

export default async function WorkspaceNewCharacterPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return NewCharacterPage({ params });
}
