import type { ArcStateCreator, ArcImportExportState } from './types';
import { exportArcGraph as exportGraph, importArcGraph as importGraph } from '@/modules/arc-graph/utils';

/**
 * Arc Import/Export Slice
 * Handles import and export of arc graphs
 */
export const createArcImportExportSlice: ArcStateCreator<ArcImportExportState> = (set, get) => ({
  exportArcGraph: (graphId: string) => {
    const graph = get().arcGraphs[graphId];
    if (!graph) {
      console.error(`Arc graph ${graphId} not found`);
      return null;
    }

    return exportGraph(graph);
  },

  exportArcProject: () => {
    const { arcGraphs } = get();
    return JSON.stringify({ arcGraphs }, null, 2);
  },

  importArcGraph: (jsonString: string) => {
    try {
      const graph = importGraph(jsonString);

      set((state) => ({
        arcGraphs: {
          ...state.arcGraphs,
          [graph.id]: graph,
        },
        currentArcGraphId: graph.id,
      }), false, 'importArcGraph');

      return graph.id;
    } catch (error) {
      console.error('Failed to import arc graph:', error);
      return null;
    }
  },

  importArcProject: (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      const { arcGraphs } = data;

      if (!arcGraphs || typeof arcGraphs !== 'object') {
        throw new Error('Invalid arc project format');
      }

      set({ arcGraphs }, false, 'importArcProject');
    } catch (error) {
      console.error('Failed to import arc project:', error);
    }
  },
});
