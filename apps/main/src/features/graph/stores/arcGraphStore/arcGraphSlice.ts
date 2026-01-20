import {
  removeGraphFromCollection,
  duplicateGraph,
  renameGraph,
  getGraph,
  listGraphs,
  updateGraphInCollection,
  generateGraphId,
} from '@pixsim7/shared.graph.utilities';

import { createEmptyArcGraph, type ArcGraph } from '@features/graph/models/arcGraph';

import type { ArcStateCreator, ArcGraphManagementState } from './types';

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
    set((state) => ({
      arcGraphs: removeGraphFromCollection(state.arcGraphs, graphId),
      currentArcGraphId: state.currentArcGraphId === graphId ? null : state.currentArcGraphId,
    }), false, 'deleteArcGraph');
  },

  duplicateArcGraph: (graphId: string, newTitle?: string) => {
    const state = get();
    const newGraphId = generateGraphId('arc');
    const newGraphs = duplicateGraph(state.arcGraphs, graphId, newGraphId, newTitle);

    if (!newGraphs) {
      console.error(`Arc graph ${graphId} not found`);
      return '';
    }

    set({ arcGraphs: newGraphs }, false, 'duplicateArcGraph');

    return newGraphId;
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
    return currentArcGraphId ? getGraph(arcGraphs, currentArcGraphId) : null;
  },

  getArcGraph: (graphId: string) => {
    return getGraph(get().arcGraphs, graphId);
  },

  listArcGraphs: () => {
    return listGraphs(get().arcGraphs);
  },

  renameArcGraph: (graphId: string, newTitle: string) => {
    set(
      (state) => ({
        arcGraphs: renameGraph(state.arcGraphs, graphId, newTitle),
      }),
      false,
      'renameArcGraph'
    );
  },

  updateArcGraphMetadata: (graphId: string, metadata: Partial<ArcGraph>) => {
    set(
      (state) => ({
        arcGraphs: updateGraphInCollection(state.arcGraphs, graphId, metadata),
      }),
      false,
      'updateArcGraphMetadata'
    );
  },
});

