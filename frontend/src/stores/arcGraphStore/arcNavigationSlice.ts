import type { ArcStateCreator, ArcNavigationState } from './types';

/**
 * Arc Navigation Slice
 * Handles navigation within arc graphs and drill-down to scenes
 */
export const createArcNavigationSlice: ArcStateCreator<ArcNavigationState> = (set, get) => ({
  selectedArcNodeId: null,

  setSelectedArcNode: (nodeId: string | null) => {
    set({ selectedArcNodeId: nodeId }, false, 'setSelectedArcNode');
  },

  drillDownToScene: (sceneId: string) => {
    // This will be implemented to navigate to the scene graph editor
    // For now, we'll just log and potentially trigger a route change
    console.log('Drill down to scene:', sceneId);

    // The actual navigation will be handled in the component
    // that calls this action, using React Router
  },
});
