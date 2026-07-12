import { create } from "zustand";

type CharacterUiState = {
  collapsedNodeIds: Set<string>;
  selectedNodeId: string | null;
  editorMode: "add" | "edit";
  openSidebarSectionIds: Set<string>;
  sidebarScrollRequest: { sectionId: string; nonce: number } | null;
  toggleNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  setEditorMode: (mode: "add" | "edit") => void;
  toggleSidebarSection: (sectionId: string) => void;
  openSidebarSection: (sectionId: string, scroll?: boolean) => void;
};

export const useCharacterUiStore = create<CharacterUiState>((set) => ({
  collapsedNodeIds: new Set(),
  selectedNodeId: null,
  editorMode: "add",
  openSidebarSectionIds: new Set(),
  sidebarScrollRequest: null,
  toggleNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { collapsedNodeIds: next };
    }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  toggleSidebarSection: (sectionId) =>
    set((state) => {
      const next = new Set(state.openSidebarSectionIds);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return { openSidebarSectionIds: next };
    }),
  openSidebarSection: (sectionId, scroll = false) =>
    set((state) => {
      const next = new Set(state.openSidebarSectionIds);
      next.add(sectionId);
      return {
        openSidebarSectionIds: next,
        sidebarScrollRequest: scroll ? { sectionId, nonce: Date.now() } : state.sidebarScrollRequest,
      };
    })
}));
