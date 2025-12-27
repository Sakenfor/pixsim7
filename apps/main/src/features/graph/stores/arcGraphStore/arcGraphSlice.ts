import type { ArcStateCreator, ArcGraphManagementState } from './types';
import { createEmptyArcGraph } from '@features/graph/domain/arcGraph/utils';
import type { ArcGraph } from '@features/graph/domain/arcGraph';

/**
 * Arc Graph Management Slice
 * Handles CRUD operations for arc graphs
 */
export const createArcGraphSlice: ArcStateCreator<ArcGraphManagementState> = (set, get) => ({
  arcGraphs: {},
  currentArcGraphId: null,

  createArcGraph: (title: string, description?: string) => {
    const graph = createEmptyArcGraph(title);
    if (description) {
      graph.description = description;
    }

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [graph.id]: graph,
      },
      currentArcGraphId: graph.id,
    }), false, 'createArcGraph');

    return graph.id;
  },

  deleteArcGraph: (graphId: string) => {
    set((state) => {
      const { [graphId]: deleted, ...rest } = state.arcGraphs;
      return {
        arcGraphs: rest,
        currentArcGraphId: state.currentArcGraphId === graphId ? null : state.currentArcGraphId,
      };
    }, false, 'deleteArcGraph');
  },

  duplicateArcGraph: (graphId: string, newTitle?: string) => {
    const original = get().arcGraphs[graphId];
    if (!original) {
      console.error(`Arc graph ${graphId} not found`);
      return '';
    }

    const duplicate: ArcGraph = {
      ...original,
      id: crypto.randomUUID(),
      title: newTitle || `${original.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set((state) => ({
      arcGraphs: {
        ...state.arcGraphs,
        [duplicate.id]: duplicate,
      },
    }), false, 'duplicateArcGraph');

    return duplicate.id;
  },

  loadArcGraph: (graphId: string) => {
    const graph = get().arcGraphs[graphId];
    if (!graph) {
      console.error(`Arc graph ${graphId} not found`);
      return;
    }

    set({ currentArcGraphId: graphId }, false, 'loadArcGraph');
  },

  getCurrentArcGraph: () => {
    const { currentArcGraphId, arcGraphs } = get();
    return currentArcGraphId ? arcGraphs[currentArcGraphId] || null : null;
  },

  getArcGraph: (graphId: string) => {
    return get().arcGraphs[graphId] || null;
  },

  listArcGraphs: () => {
    return Object.values(get().arcGraphs);
  },

  renameArcGraph: (graphId: string, newTitle: string) => {
    set((state) => {
      const graph = state.arcGraphs[graphId];
      if (!graph) return state;

      return {
        arcGraphs: {
          ...state.arcGraphs,
          [graphId]: {
            ...graph,
            title: newTitle,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }, false, 'renameArcGraph');
  },

  updateArcGraphMetadata: (graphId: string, metadata: Partial<ArcGraph>) => {
    set((state) => {
      const graph = state.arcGraphs[graphId];
      if (!graph) return state;

      return {
        arcGraphs: {
          ...state.arcGraphs,
          [graphId]: {
            ...graph,
            ...metadata,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    }, false, 'updateArcGraphMetadata');
  },
});
