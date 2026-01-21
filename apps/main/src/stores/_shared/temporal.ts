/**
 * Temporal Middleware for Graph Stores
 *
 * Provides undo/redo functionality for all graph stores using zundo.
 * This module wraps Zustand stores with temporal (time-travel) capabilities.
 *
 * Key features:
 * - Undo/redo with configurable history depth
 * - Selective state tracking (partialize)
 * - Minimal memory footprint (patch-based diffing)
 * - Automatic integration with existing stores
 *
 * Usage:
 * ```typescript
 * const useMyStore = create<MyState>()(
 *   devtools(
 *     temporal(
 *       (set, get) => ({ ... }),
 *       {
 *         limit: 50,
 *         partialize: (state) => ({ tracked: state.tracked }),
 *       }
 *     )
 *   )
 * );
 * ```
 *
 * @module stores/_shared/temporal
 */

import { temporal } from 'zundo';
import type { TemporalState } from 'zundo';
import type { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand';

/**
 * Configuration options for temporal middleware
 */
export interface TemporalConfig<T> {
  /** Maximum number of history states to keep (default: 50) */
  limit?: number;

  /** Function to select which parts of state to track */
  partialize?: (state: T) => Partial<T>;

  /** Custom equality function for detecting changes */
  equality?: (pastState: Partial<T>, currentState: Partial<T>) => boolean;

  /**
   * Whether to handle set operations manually
   * If true, only explicit handleSet calls create history entries
   */
  handleSet?: boolean;
}

/**
 * Create a temporal store with undo/redo capabilities
 *
 * This is the main function to wrap your state creator with temporal middleware.
 * It provides automatic undo/redo functionality with configurable options.
 *
 * @param stateCreator - The Zustand state creator function
 * @param config - Temporal configuration options
 * @returns Wrapped state creator with temporal capabilities
 *
 * @example
 * ```typescript
 * const useGraphStore = create<GraphState>()(
 *   devtools(
 *     createTemporalStore(
 *       (set, get) => ({
 *         scenes: {},
 *         currentSceneId: null,
 *         // ... actions
 *       }),
 *       {
 *         limit: 50,
 *         partialize: (state) => ({
 *           scenes: state.scenes,
 *           currentSceneId: state.currentSceneId,
 *         }),
 *       }
 *     ),
 *     { name: 'GraphStore' }
 *   )
 * );
 * ```
 */
export function createTemporalStore<
  TState,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  stateCreator: StateCreator<TState, Mps, Mcs>,
  config?: TemporalConfig<TState>
): StateCreator<TState, Mps, [['temporal', StoreApi<TemporalState<Partial<TState>>>], ...Mcs]> {
  return temporal(stateCreator as unknown as StateCreator<TState, [...Mps, ['temporal', unknown]], Mcs>, {
    limit: config?.limit ?? 50,
    partialize: config?.partialize,
    equality: config?.equality ?? ((a, b) => a === b),
  });
}

/**
 * Type helper for stores with temporal capabilities
 *
 * This extends your store state type with temporal actions.
 */
export type WithTemporal<T> = T & {
  temporal: TemporalState<T>;
};

/**
 * Default partialize function for graph stores
 *
 * Excludes transient UI state from undo/redo history:
 * - selectedNodeIds (UI selection state)
 * - hoveredNodeId (UI hover state)
 * - isDragging (UI drag state)
 * - viewportState (UI viewport state)
 *
 * This ensures undo/redo only affects actual data, not UI state.
 *
 * @param state - The full store state
 * @returns Partialized state with only tracked properties
 *
 * @example
 * ```typescript
 * createTemporalStore(
 *   (set, get) => ({ ... }),
 *   {
 *     partialize: graphStorePartialize,
 *   }
 * )
 * ```
 */
export function graphStorePartialize<
  T extends {
    scenes?: any;
    currentSceneId?: string | null;
    sceneMetadata?: any;
    selectedNodeIds?: string[];
    hoveredNodeId?: string | null;
    isDragging?: boolean;
    viewportState?: any;
  }
>(state: T): Partial<T> {
  // Extract only the properties we want to track
  const {
    selectedNodeIds,
    hoveredNodeId,
    isDragging,
    viewportState,
    ...tracked
  } = state as any;
  void selectedNodeIds;
  void hoveredNodeId;
  void isDragging;
  void viewportState;

  // Return everything except the excluded UI state
  return tracked as Partial<T>;
}

/**
 * Partialize function for arc graph stores
 *
 * Tracks arc graphs and current arc graph ID, excludes UI state.
 */
export function arcGraphStorePartialize<
  T extends {
    arcGraphs?: any;
    currentArcGraphId?: string | null;
    selectedNodeIds?: string[];
    selectedEdgeIds?: string[];
  }
>(state: T): Partial<T> {
  const { selectedNodeIds, selectedEdgeIds, ...tracked } = state as any;
  void selectedNodeIds;
  void selectedEdgeIds;
  return tracked as Partial<T>;
}

/**
 * Partialize function for scene collection stores
 *
 * Tracks collections only, excludes UI state.
 */
export function sceneCollectionStorePartialize<
  T extends {
    collections?: any;
    selectedCollectionId?: string | null;
  }
>(state: T): Partial<T> {
  const { selectedCollectionId, ...tracked } = state as any;
  void selectedCollectionId;
  return tracked as Partial<T>;
}

/**
 * Partialize function for campaign stores
 *
 * Tracks campaigns only, excludes UI state.
 */
export function campaignStorePartialize<
  T extends {
    campaigns?: any;
    currentCampaignId?: string | null;
  }
>(state: T): Partial<T> {
  const { currentCampaignId, ...tracked } = state as any;
  void currentCampaignId;
  return tracked as Partial<T>;
}

/**
 * Type guard to check if a store has temporal capabilities
 */
export function hasTemporal<T>(
  store: any
): store is WithTemporal<T> {
  return store && typeof store.temporal !== 'undefined';
}
