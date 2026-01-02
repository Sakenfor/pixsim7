import type { StateCreator as ZustandStateCreator } from 'zustand';

import type { ArcGraph, ArcGraphEdge, ArcGraphNode } from '@features/graph/models/arcGraph';

/**
 * Arc Graph Store State Interface
 */
export interface ArcGraphState
  extends ArcGraphManagementState,
    ArcNodeManagementState,
    ArcNavigationState,
    ArcImportExportState {}

// ===== Core State =====

export interface CoreArcState {
  // All arc graphs in the project
  arcGraphs: Record<string, ArcGraph>;

  // Currently editing this arc graph
  currentArcGraphId: string | null;
}

// ===== Arc Graph Management =====

export interface ArcGraphManagementState {
  arcGraphs: Record<string, ArcGraph>;
  currentArcGraphId: string | null;

  // Arc Graph CRUD
  createArcGraph: (title: string, description?: string) => string;
  deleteArcGraph: (graphId: string) => void;
  duplicateArcGraph: (graphId: string, newTitle?: string) => string;
  loadArcGraph: (graphId: string) => void;
  getCurrentArcGraph: () => ArcGraph | null;
  getArcGraph: (graphId: string) => ArcGraph | null;
  listArcGraphs: () => ArcGraph[];
  renameArcGraph: (graphId: string, newTitle: string) => void;
  updateArcGraphMetadata: (graphId: string, metadata: Partial<ArcGraph>) => void;
}

// ===== Arc Node Management =====

export interface ArcNodeManagementState {
  addArcNode: (node: ArcGraphNode) => void;
  updateArcNode: (id: string, patch: Partial<ArcGraphNode>) => void;
  removeArcNode: (id: string) => void;
  connectArcNodes: (fromId: string, toId: string, meta?: ArcGraphEdge['meta']) => void;
  removeArcEdge: (edgeId: string) => void;
  setStartArcNode: (id: string) => void;
  getArcNode: (id: string) => ArcGraphNode | null;
}

// ===== Arc Navigation =====

export interface ArcNavigationState {
  selectedArcNodeId: string | null;
  setSelectedArcNode: (nodeId: string | null) => void;
  drillDownToScene: (sceneId: string) => void;
}

// ===== Arc Import/Export =====

export interface ArcImportExportState {
  exportArcGraph: (graphId: string) => string | null;
  exportArcProject: () => string;
  importArcGraph: (jsonString: string) => string | null;
  importArcProject: (jsonString: string) => void;
}

// ===== Slice Creator Type =====

export type ArcStateCreator<T> = ZustandStateCreator<
  ArcGraphState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  T
>;

