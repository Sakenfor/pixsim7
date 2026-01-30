/**
 * Routine Graph Selection Store
 *
 * Separate store for UI selection state.
 * Follows the same pattern as features/graph/stores/selectionStore.ts
 *
 * Selection state is kept separate from data state so that:
 * 1. Undo/redo only affects data, not UI selection
 * 2. Selection changes don't create history entries
 * 3. Clean separation of concerns
 */

import { create } from 'zustand';

interface RoutineGraphSelectionState {
  // Single selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // Multi-selection support
  selectedNodeIds: string[];

  // Actions
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  selectNodes: (nodeIds: string[]) => void;
  clearSelection: () => void;
  toggleNodeSelection: (nodeId: string) => void;
}

export const useRoutineGraphSelectionStore = create<RoutineGraphSelectionState>((set) => ({
  // Initial state
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: [],

  // Select single node (clears edge selection)
  selectNode: (nodeId) => set({
    selectedNodeId: nodeId,
    selectedEdgeId: null,
    selectedNodeIds: nodeId ? [nodeId] : [],
  }),

  // Select single edge (clears node selection)
  selectEdge: (edgeId) => set({
    selectedEdgeId: edgeId,
    selectedNodeId: null,
    selectedNodeIds: [],
  }),

  // Select multiple nodes
  selectNodes: (nodeIds) => set({
    selectedNodeIds: nodeIds,
    selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
    selectedEdgeId: null,
  }),

  // Clear all selection
  clearSelection: () => set({
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: [],
  }),

  // Toggle node in multi-selection
  toggleNodeSelection: (nodeId) => set((state) => {
    const isSelected = state.selectedNodeIds.includes(nodeId);
    const newIds = isSelected
      ? state.selectedNodeIds.filter((id) => id !== nodeId)
      : [...state.selectedNodeIds, nodeId];

    return {
      selectedNodeIds: newIds,
      selectedNodeId: newIds.length === 1 ? newIds[0] : null,
      selectedEdgeId: null,
    };
  }),
}));

// Selectors for common access patterns
export const routineGraphSelectionSelectors = {
  selectedNodeId: (state: RoutineGraphSelectionState) => state.selectedNodeId,
  selectedEdgeId: (state: RoutineGraphSelectionState) => state.selectedEdgeId,
  selectedNodeIds: (state: RoutineGraphSelectionState) => state.selectedNodeIds,
  hasSelection: (state: RoutineGraphSelectionState) =>
    state.selectedNodeId !== null || state.selectedEdgeId !== null,
  isNodeSelected: (nodeId: string) => (state: RoutineGraphSelectionState) =>
    state.selectedNodeIds.includes(nodeId),
};
