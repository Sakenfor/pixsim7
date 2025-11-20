import { create } from 'zustand';

interface SelectionState {
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeId: null,
  selectedNodeIds: [],
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setSelectedNodeIds: (ids) => set({
    selectedNodeIds: ids,
    // Update single selection for backward compatibility
    selectedNodeId: ids.length === 1 ? ids[0] : null,
  }),
}));
