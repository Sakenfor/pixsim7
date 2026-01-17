import { exportArcGraph as exportArcGraphModel, importArcGraph as importArcGraphModel } from '@features/graph/models/arcGraph';
import { exportGraph, exportProject, importProject } from '@pixsim7/shared.graph-utilities';

import type { ArcGraph } from '@features/graph/models/arcGraph';
import type { ArcStateCreator, ArcImportExportState } from './types';

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

    // Use model-specific export if it exists, otherwise use generic
    return exportArcGraphModel ? exportArcGraphModel(graph) : exportGraph(graph);
  },

  exportArcProject: () => {
    const { arcGraphs } = get();
    return exportProject(arcGraphs);
  },

  importArcGraph: (jsonString: string) => {
    try {
      // Use model-specific import for validation
      const graph = importArcGraphModel(jsonString);

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
    const validateProject = (data: any) => {
      return data.arcGraphs && typeof data.arcGraphs === 'object';
    };

    const arcGraphs = importProject<ArcGraph>(jsonString, 'arcGraphs', validateProject);

    if (!arcGraphs) {
      console.error('Failed to import arc project');
      return;
    }

    set({ arcGraphs }, false, 'importArcProject');
  },
});

