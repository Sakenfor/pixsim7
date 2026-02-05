/**
 * Selection Store Factory
 *
 * Creates a Zustand store for UI selection state.
 * Selection is kept separate from data so that:
 * 1. Undo/redo only affects data, not UI selection
 * 2. Selection changes don't create history entries
 * 3. Clean separation of concerns
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { SelectionState, SelectionActions, SelectionStore } from '../types';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating a selection store
 */
export interface CreateSelectionStoreConfig {
  /** Store name (for debugging) */
  name?: string;

  /** Initial selection state overrides */
  initialState?: Partial<SelectionState>;

  /** Additional state to include */
  additionalState?: Record<string, unknown>;

  /** Additional actions to include */
  additionalActions?: (
    set: (partial: Partial<SelectionState>) => void,
    get: () => SelectionStore
  ) => Record<string, unknown>;
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Create a selection store for editor UI state
 *
 * @example
 * ```typescript
 * const useRoutineGraphSelectionStore = createSelectionStore({
 *   name: 'routine-graph-selection',
 * });
 *
 * // In component:
 * const selectedNodeId = useRoutineGraphSelectionStore((s) => s.selectedNodeId);
 * const { selectNode, clearSelection } = useRoutineGraphSelectionStore();
 * ```
 */
export function createSelectionStore(
  config: CreateSelectionStoreConfig = {}
): UseBoundStore<StoreApi<SelectionStore>> {
  const {
    initialState = {},
    additionalState = {},
    additionalActions,
  } = config;

  return create<SelectionStore>((set, get) => {
    const baseState: SelectionState = {
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      ...initialState,
    };

    const baseActions: SelectionActions = {
      selectNode: (nodeId) => set({
        selectedNodeId: nodeId,
        selectedEdgeId: null,
        selectedNodeIds: nodeId ? [nodeId] : [],
        selectedEdgeIds: [],
      }),

      selectEdge: (edgeId) => set({
        selectedEdgeId: edgeId,
        selectedNodeId: null,
        selectedNodeIds: [],
        selectedEdgeIds: edgeId ? [edgeId] : [],
      }),

      selectNodes: (nodeIds) => set({
        selectedNodeIds: nodeIds,
        selectedNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
        selectedEdgeId: null,
        selectedEdgeIds: [],
      }),

      selectEdges: (edgeIds) => set({
        selectedEdgeIds: edgeIds,
        selectedEdgeId: edgeIds.length === 1 ? edgeIds[0] : null,
        selectedNodeId: null,
        selectedNodeIds: [],
      }),

      clearSelection: () => set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }),

      toggleNodeSelection: (nodeId) => set((state) => {
        const isSelected = state.selectedNodeIds.includes(nodeId);
        const newIds = isSelected
          ? state.selectedNodeIds.filter((id) => id !== nodeId)
          : [...state.selectedNodeIds, nodeId];

        return {
          selectedNodeIds: newIds,
          selectedNodeId: newIds.length === 1 ? newIds[0] : null,
          selectedEdgeId: null,
          selectedEdgeIds: [],
        };
      }),

      toggleEdgeSelection: (edgeId) => set((state) => {
        const isSelected = state.selectedEdgeIds.includes(edgeId);
        const newIds = isSelected
          ? state.selectedEdgeIds.filter((id) => id !== edgeId)
          : [...state.selectedEdgeIds, edgeId];

        return {
          selectedEdgeIds: newIds,
          selectedEdgeId: newIds.length === 1 ? newIds[0] : null,
          selectedNodeId: null,
          selectedNodeIds: [],
        };
      }),
    };

    // Merge additional state and actions
    const additional = additionalActions
      ? additionalActions(
          (partial) => set(partial),
          get
        )
      : {};

    return {
      ...baseState,
      ...additionalState,
      ...baseActions,
      ...additional,
    } as SelectionStore;
  });
}

// ============================================================================
// Selectors Factory
// ============================================================================

/**
 * Create standard selectors for a selection store
 *
 * @example
 * ```typescript
 * const selectionSelectors = createSelectionSelectors();
 *
 * // Usage:
 * const hasSelection = useSelectionStore(selectionSelectors.hasSelection);
 * const isNodeSelected = useSelectionStore(selectionSelectors.isNodeSelected('node-1'));
 * ```
 */
export function createSelectionSelectors() {
  return {
    /** Get the selected node ID */
    selectedNodeId: (state: SelectionState) => state.selectedNodeId,

    /** Get the selected edge ID */
    selectedEdgeId: (state: SelectionState) => state.selectedEdgeId,

    /** Get all selected node IDs */
    selectedNodeIds: (state: SelectionState) => state.selectedNodeIds,

    /** Get all selected edge IDs */
    selectedEdgeIds: (state: SelectionState) => state.selectedEdgeIds,

    /** Check if anything is selected */
    hasSelection: (state: SelectionState) =>
      state.selectedNodeId !== null ||
      state.selectedEdgeId !== null ||
      state.selectedNodeIds.length > 0 ||
      state.selectedEdgeIds.length > 0,

    /** Check if a specific node is selected */
    isNodeSelected: (nodeId: string) => (state: SelectionState) =>
      state.selectedNodeIds.includes(nodeId),

    /** Check if a specific edge is selected */
    isEdgeSelected: (edgeId: string) => (state: SelectionState) =>
      state.selectedEdgeIds.includes(edgeId),

    /** Get the count of selected items */
    selectionCount: (state: SelectionState) =>
      state.selectedNodeIds.length + state.selectedEdgeIds.length,

    /** Check if single node is selected */
    hasSingleNodeSelected: (state: SelectionState) =>
      state.selectedNodeIds.length === 1,

    /** Check if multiple nodes are selected */
    hasMultipleNodesSelected: (state: SelectionState) =>
      state.selectedNodeIds.length > 1,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Create a hook that returns selection state for a specific node
 *
 * Useful for node renderer components to know if they're selected.
 *
 * @example
 * ```typescript
 * const useNodeSelectionState = createNodeSelectionHook(useSelectionStore);
 *
 * // In node component:
 * const { isSelected, isMultiSelected } = useNodeSelectionState('node-1');
 * ```
 */
export function createNodeSelectionHook<TStore extends UseBoundStore<StoreApi<SelectionState>>>(
  useStore: TStore
) {
  return (nodeId: string) => {
    const selectedNodeId = useStore((s) => s.selectedNodeId);
    const selectedNodeIds = useStore((s) => s.selectedNodeIds);

    return {
      isSelected: selectedNodeIds.includes(nodeId),
      isPrimarySelection: selectedNodeId === nodeId,
      isMultiSelected: selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId),
    };
  };
}
