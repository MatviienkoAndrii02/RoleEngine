import { create } from "zustand";
import type { NodeType } from "@/domain/nodes";
import { compareImpactSnapshots, hasImpact, type CharacterImpactReport, type CharacterImpactSnapshot } from "@/domain/character-impact";

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
  impactReport: CharacterImpactReport | null;
  impactError: string | null;
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
  trackImpact: <T>(characterId: string | undefined, label: string, action: () => Promise<T>) => Promise<T>;
  clearImpactReport: () => void;
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
  impactReport: null,
  impactError: null,
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
  trackImpact: async (characterId, label, action) => {
    if (!characterId) return action();
    let before: CharacterImpactSnapshot | null = null;
    try {
      before = await fetchImpactSnapshot(characterId);
    } catch {
      set({ impactError: "before" });
    }

    const result = await action();

    if (isFailedResponse(result)) return result;
    if (!before) return result;
    try {
      const after = await fetchImpactSnapshot(characterId);
      const report = compareImpactSnapshots(label, before, after);
      set({ impactReport: hasImpact(report) ? report : { ...report, valueChanges: [], addedNodes: [], removedNodes: [] }, impactError: null });
    } catch {
      set({ impactError: "after" });
    }
    return result;
  },
  clearImpactReport: () => set({ impactReport: null, impactError: null }),
}));

async function fetchImpactSnapshot(characterId: string): Promise<CharacterImpactSnapshot> {
  const response = await fetch(`/api/characters/${characterId}/impact`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load character impact snapshot");
  return response.json() as Promise<CharacterImpactSnapshot>;
}

function isFailedResponse(value: unknown) {
  return typeof Response !== "undefined" && value instanceof Response && !value.ok;
}
