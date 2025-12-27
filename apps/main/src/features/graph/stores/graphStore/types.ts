import type {
  DraftScene,
  DraftSceneNode,
  DraftEdgeMeta,
  SceneSignature,
  SceneParameter,
  SceneReturnPoint,
  SceneMetadata,
  NodeGroupData,
} from '@domain/sceneBuilder';
import type { Scene } from '@lib/registries';
import type { StateCreator as ZustandStateCreator } from 'zustand';

/**
 * Graph Store State Interface
 *
 * Multi-scene architecture with scene-as-function support
 */
export interface GraphState
  extends SceneManagementState,
    SignatureManagementState,
    NodeManagementState,
    NodeGroupManagementState,
    NavigationState,
    CrossSceneState,
    ImportExportState,
    RuntimeConversionState {}

// ===== Core State =====

export interface CoreState {
  // All scenes in the project
  scenes: Record<string, DraftScene>;

  // Currently editing this scene
  currentSceneId: string | null;

  // Scene metadata cache
  sceneMetadata: Record<string, SceneMetadata>;
}

// ===== Scene Management =====

export interface SceneManagementState {
  scenes: Record<string, DraftScene>;
  currentSceneId: string | null;
  sceneMetadata: Record<string, SceneMetadata>;

  // Scene CRUD
  createScene: (title: string, options?: { isReusable?: boolean; signature?: Partial<SceneSignature> }) => string;
  deleteScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string, newTitle?: string) => string;
  loadScene: (sceneId: string) => void;
  getCurrentScene: () => DraftScene | null;
  getScene: (sceneId: string) => DraftScene | null;
  listScenes: () => DraftScene[];
  renameScene: (sceneId: string, newTitle: string) => void;
  getSceneIds: () => Set<string>;
}

// ===== Signature Management =====

export interface SignatureManagementState {
  updateSceneSignature: (sceneId: string, signature: Partial<SceneSignature>) => void;
  addSceneParameter: (sceneId: string, parameter: SceneParameter) => void;
  removeSceneParameter: (sceneId: string, parameterName: string) => void;
  addReturnPoint: (sceneId: string, returnPoint: SceneReturnPoint) => void;
  removeReturnPoint: (sceneId: string, returnPointId: string) => void;
}

// ===== Node Management =====

export interface NodeManagementState {
  addNode: (node: DraftSceneNode) => void;
  updateNode: (id: string, patch: Partial<DraftSceneNode>) => void;
  removeNode: (id: string) => void;
  connectNodes: (fromId: string, toId: string, meta?: DraftEdgeMeta) => void;
  attachEdgeMeta: (edgeId: string, metaPatch: Partial<DraftEdgeMeta>) => void;
  setStartNode: (id: string) => void;
}

// ===== Node Group Management =====

export interface NodeGroupManagementState {
  createNodeGroup: (
    nodeIds: string[],
    options?: {
      label?: string;
      color?: string;
      icon?: string;
      description?: string;
    }
  ) => string | null;
  addNodesToGroup: (groupId: string, nodeIds: string[]) => void;
  removeNodesFromGroup: (groupId: string, nodeIds: string[]) => void;
  deleteNodeGroup: (groupId: string, deleteChildren?: boolean) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  getGroupChildren: (groupId: string) => DraftSceneNode[];
  getNodeGroup: (nodeId: string) => NodeGroupData | null;
  listNodeGroups: () => NodeGroupData[];
}

// ===== Navigation =====

export interface NavigationState {
  navigationStack: string[];
  zoomIntoGroup: (groupId: string) => void;
  zoomOut: () => void;
  zoomToRoot: () => void;
  getCurrentZoomLevel: () => string | null;
  getNavigationBreadcrumbs: () => Array<{ id: string; label: string }>;
}

// ===== Cross-Scene References =====

export interface CrossSceneState {
  getSceneCallers: (sceneId: string) => Array<{ sceneId: string; nodeIds: string[] }>;
  getSceneCalls: (sceneId: string) => Array<{ targetSceneId: string; nodeId: string }>;
  validateSceneCall: (callNode: Extract<DraftSceneNode, { type: 'scene_call' }>) => {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

// ===== Import/Export =====

export interface ImportExportState {
  exportScene: (sceneId: string) => string | null;
  exportProject: () => string;
  importScene: (jsonString: string) => string | null;
  importProject: (jsonString: string) => void;
}

// ===== Runtime Conversion =====

export interface RuntimeConversionState {
  toRuntimeScene: (sceneId?: string) => Scene | null;
}

// ===== Slice Creator Type =====

// Use Zustand's StateCreator with devtools and persist middleware
export type StateCreator<T> = ZustandStateCreator<
  GraphState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  T
>;
