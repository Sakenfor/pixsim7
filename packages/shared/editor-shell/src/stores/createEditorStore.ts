/**
 * Editor Store Factory
 *
 * Creates a Zustand store with undo/redo (temporal), persistence, and devtools
 * for graph-based editors. This factory reduces boilerplate and ensures
 * consistent patterns across all editor implementations.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import type { StoreApi } from 'zustand';
import type { TemporalState } from 'zundo';
import {
  addGraphToCollection,
  updateGraphInCollection,
  removeGraphFromCollection,
  listGraphs,
  generateGraphId,
} from '@pixsim7/shared.graph.utilities';

import type { BaseGraph, EditorDataState, EditorDataActions, PartializeFn } from '../types';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for creating an editor store
 */
export interface CreateEditorStoreConfig<TGraph extends BaseGraph = BaseGraph> {
  /** Store name (for devtools and persistence) */
  name: string;

  /** Prefix for graph IDs (e.g., 'routine', 'arc') */
  graphIdPrefix: string;

  /** Factory function to create a new graph */
  createDefaultGraph: (name: string) => TGraph;

  /** Maximum undo history depth (default: 50) */
  historyLimit?: number;

  /** Custom partialize function for temporal middleware */
  partialize?: PartializeFn<EditorDataState<TGraph> & EditorDataActions<TGraph>>;

  /** Persistence configuration (set to false to disable) */
  persistence?: boolean | {
    /** Storage key name */
    name?: string;
  };
}

// ============================================================================
// Default Partialize Function
// ============================================================================

/**
 * Default partialize function that excludes transient state from undo/redo
 */
function defaultPartialize<TGraph extends BaseGraph>(
  state: EditorDataState<TGraph>
): Partial<EditorDataState<TGraph>> {
  return {
    graphs: state.graphs,
    currentGraphId: state.currentGraphId,
    contextId: state.contextId,
    // Exclude: isDirty, lastSavedAt (transient)
  };
}

/**
 * Default persistence partialize function
 */
function defaultPersistPartialize<TGraph extends BaseGraph>(
  state: EditorDataState<TGraph>
): Partial<EditorDataState<TGraph>> {
  return {
    graphs: state.graphs,
    contextId: state.contextId,
    currentGraphId: state.currentGraphId,
  };
}

// ============================================================================
// Store Factory
// ============================================================================

type EditorStoreState<TGraph extends BaseGraph> = EditorDataState<TGraph> & EditorDataActions<TGraph>;

/**
 * Create an editor store with full temporal, persistence, and devtools support
 *
 * @example
 * ```typescript
 * const useRoutineGraphStore = createEditorStore({
 *   name: 'routine-graph',
 *   graphIdPrefix: 'routine',
 *   createDefaultGraph: (name) => ({
 *     id: generateGraphId('routine'),
 *     version: 1,
 *     name,
 *     nodes: [],
 *     edges: [],
 *     updatedAt: new Date().toISOString(),
 *   }),
 * });
 * ```
 */
export function createEditorStore<TGraph extends BaseGraph = BaseGraph>(
  config: CreateEditorStoreConfig<TGraph>
) {
  const {
    name,
    graphIdPrefix,
    createDefaultGraph,
    historyLimit = 50,
    partialize = defaultPartialize,
    persistence = true,
  } = config;

  type StoreState = EditorStoreState<TGraph>;

  // Build the core state creator
  const createState = (
    set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>), replace?: boolean, action?: string) => void,
    get: () => StoreState
  ): StoreState => {
    const baseState: EditorDataState<TGraph> = {
      graphs: {} as Record<string, TGraph>,
      currentGraphId: null,
      contextId: null,
      isDirty: false,
      lastSavedAt: null,
    };

    const baseActions: EditorDataActions<TGraph> = {
      setContext: (contextId) => set({
        contextId,
        currentGraphId: null,
        graphs: {} as Record<string, TGraph>,
      } as Partial<StoreState>, false, 'setContext'),

      loadGraphs: (graphs) => set({
        graphs,
      } as Partial<StoreState>, false, 'loadGraphs'),

      setCurrentGraph: (graphId) => set({
        currentGraphId: graphId,
      } as Partial<StoreState>, false, 'setCurrentGraph'),

      createGraph: (graphName) => {
        const graph = createDefaultGraph(graphName);
        set((state) => ({
          graphs: addGraphToCollection(state.graphs, graph),
          currentGraphId: graph.id,
          isDirty: true,
        } as Partial<StoreState>), false, 'createGraph');
        return graph.id;
      },

      updateGraph: (graphId, patch) => {
        set((state) => ({
          graphs: updateGraphInCollection(state.graphs, graphId, patch),
          isDirty: true,
        } as Partial<StoreState>), false, 'updateGraph');
      },

      deleteGraph: (graphId) => {
        set((state) => ({
          graphs: removeGraphFromCollection(state.graphs, graphId),
          currentGraphId: state.currentGraphId === graphId ? null : state.currentGraphId,
          isDirty: true,
        } as Partial<StoreState>), false, 'deleteGraph');
      },

      duplicateGraph: (graphId) => {
        const { graphs } = get();
        const source = graphs[graphId];
        if (!source) return null;

        const newGraph: TGraph = {
          ...source,
          id: generateGraphId(graphIdPrefix),
          name: `${source.name} (copy)`,
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          graphs: addGraphToCollection(state.graphs, newGraph),
          currentGraphId: newGraph.id,
          isDirty: true,
        } as Partial<StoreState>), false, 'duplicateGraph');

        return newGraph.id;
      },

      markDirty: () => set({ isDirty: true } as Partial<StoreState>, false, 'markDirty'),

      markSaved: () => set({
        isDirty: false,
        lastSavedAt: Date.now(),
      } as Partial<StoreState>, false, 'markSaved'),

      reset: () => set({
        graphs: {} as Record<string, TGraph>,
        currentGraphId: null,
        contextId: null,
        isDirty: false,
        lastSavedAt: null,
      } as Partial<StoreState>, false, 'reset'),
    };

    return {
      ...baseState,
      ...baseActions,
    };
  };

  // Create the store with middleware
  // Using a simplified approach to avoid complex middleware type issues
  const storeName = pascalCase(name) + 'Store';
  const persistName = typeof persistence === 'object' && persistence.name
    ? persistence.name
    : `${name}-store`;

  const useStore = persistence
    ? create<StoreState>()(
        devtools(
          persist(
            temporal(
              createState as any,
              {
                limit: historyLimit,
                partialize: partialize as any,
              }
            ),
            {
              name: persistName,
              partialize: defaultPersistPartialize as any,
            }
          ),
          { name: storeName }
        )
      )
    : create<StoreState>()(
        devtools(
          temporal(
            createState as any,
            {
              limit: historyLimit,
              partialize: partialize as any,
            }
          ),
          { name: storeName }
        )
      );

  return useStore;
}

// ============================================================================
// Selectors Factory
// ============================================================================

/**
 * Create standard selectors for an editor store
 */
export function createEditorSelectors<TGraph extends BaseGraph>() {
  return {
    currentGraph: (state: EditorDataState<TGraph>): TGraph | null => {
      if (!state.currentGraphId) return null;
      return state.graphs[state.currentGraphId] ?? null;
    },

    graphList: (state: EditorDataState<TGraph>): TGraph[] => {
      return listGraphs(state.graphs);
    },

    isDirty: (state: EditorDataState<TGraph>): boolean => state.isDirty,

    hasGraphs: (state: EditorDataState<TGraph>): boolean => {
      return Object.keys(state.graphs).length > 0;
    },

    graphCount: (state: EditorDataState<TGraph>): number => {
      return Object.keys(state.graphs).length;
    },
  };
}

/**
 * Create temporal selectors for undo/redo state
 */
export function createTemporalSelectors<TStore extends { temporal?: StoreApi<TemporalState<unknown>> }>(
  useStore: TStore
) {
  return {
    canUndo: (): boolean => {
      const temporal = (useStore as any).temporal?.getState();
      return (temporal?.pastStates?.length ?? 0) > 0;
    },

    canRedo: (): boolean => {
      const temporal = (useStore as any).temporal?.getState();
      return (temporal?.futureStates?.length ?? 0) > 0;
    },
  };
}

/**
 * Create undo/redo hooks for a store with temporal middleware
 */
export function createTemporalHooks<TStore extends { temporal?: StoreApi<TemporalState<unknown>> }>(
  useStore: TStore
) {
  return {
    useUndo: () => (useStore as any).temporal?.getState().undo,
    useRedo: () => (useStore as any).temporal?.getState().redo,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
