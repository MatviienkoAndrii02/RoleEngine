import { create } from "zustand";
import type { NodeType } from "@/domain/nodes";

type NodePickRequest = {
  pickerId: string;
  allowedTypes?: NodeType[];
  nonce: number;
};

type PickedNode = {
  pickerId: string;
  nodeId: string;
  nonce: number;
};

type CharacterUiState = {
  collapsedNodeIds: Set<string>;
  expandedNodeIds: Set<string>;
  selectedNodeId: string | null;
  editorMode: "add" | "edit";
  openSidebarSectionIds: Set<string>;
  sidebarScrollRequest: { sectionId: string; nonce: number } | null;
  nodePickRequest: NodePickRequest | null;
  pickedNode: PickedNode | null;
  toggleNode: (nodeId: string, collapsedByDefault?: boolean) => void;
  revealNode: (nodeId: string, ancestorIds?: string[]) => void;
  selectNode: (nodeId: string | null) => void;
  setEditorMode: (mode: "add" | "edit") => void;
  toggleSidebarSection: (sectionId: string) => void;
  openSidebarSection: (sectionId: string, scroll?: boolean) => void;
  startNodePick: (pickerId: string, allowedTypes?: NodeType[]) => void;
  cancelNodePick: () => void;
  completeNodePick: (nodeId: string) => void;
  clearPickedNode: (pickerId: string) => void;
};

export const useCharacterUiStore = create<CharacterUiState>((set) => ({
  collapsedNodeIds: new Set(),
  expandedNodeIds: new Set(),
  selectedNodeId: null,
  editorMode: "add",
  openSidebarSectionIds: new Set(),
  sidebarScrollRequest: null,
  nodePickRequest: null,
  pickedNode: null,
  toggleNode: (nodeId, collapsedByDefault = false) =>
    set((state) => {
      if (collapsedByDefault) {
        const nextExpanded = new Set(state.expandedNodeIds);
        if (nextExpanded.has(nodeId)) nextExpanded.delete(nodeId);
        else nextExpanded.add(nodeId);
        return { expandedNodeIds: nextExpanded };
      }
      const next = new Set(state.collapsedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { collapsedNodeIds: next };
    }),
  revealNode: (nodeId, ancestorIds = []) =>
    set((state) => {
      const collapsedNodeIds = new Set(state.collapsedNodeIds);
      const expandedNodeIds = new Set(state.expandedNodeIds);
      for (const ancestorId of ancestorIds) {
        collapsedNodeIds.delete(ancestorId);
        expandedNodeIds.add(ancestorId);
      }
      return { selectedNodeId: nodeId, collapsedNodeIds, expandedNodeIds };
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
    }),
  startNodePick: (pickerId, allowedTypes) => set({ nodePickRequest: { pickerId, allowedTypes, nonce: Date.now() } }),
  cancelNodePick: () => set({ nodePickRequest: null }),
  completeNodePick: (nodeId) =>
    set((state) => state.nodePickRequest
      ? {
          selectedNodeId: nodeId,
          pickedNode: { pickerId: state.nodePickRequest.pickerId, nodeId, nonce: Date.now() },
          nodePickRequest: null,
        }
      : {}),
  clearPickedNode: (pickerId) => set((state) => state.pickedNode?.pickerId === pickerId ? { pickedNode: null } : {}),
}));
