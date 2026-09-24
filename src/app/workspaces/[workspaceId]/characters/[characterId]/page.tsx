import CharacterPage from "@/app/characters/[characterId]/page";

export default async function WorkspaceCharacterPage({ params }: { params: Promise<{ workspaceId: string; characterId: string }> }) {
  return CharacterPage({ params });
}
