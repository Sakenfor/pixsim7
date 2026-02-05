/**
 * Editor Shell Types
 *
 * Generic type definitions for the editor shell system.
 * These types are designed to work with any graph-based editor.
 */

import type { ComponentType, ReactNode } from 'react';
import type { NodeWithId, EdgeWithFromTo } from '@pixsim7/shared.graph.utilities';
import type { StoreApi } from 'zustand';
import type { TemporalState } from 'zundo';

// ============================================================================
// Base Graph Types
// ============================================================================

/**
 * Base interface for any graph structure
 */
export interface BaseGraph<TNode extends NodeWithId = NodeWithId, TEdge extends EdgeWithFromTo = EdgeWithFromTo> {
  id: string;
  version?: number;
  name: string;
  nodes: TNode[];
  edges: TEdge[];
  updatedAt?: string;
  meta?: Record<string, unknown>;
}

/**
 * Position in 2D space (for node positioning)
 */
export interface Position {
  x: number;
  y: number;
}

// ============================================================================
// Editor Store Types
// ============================================================================

/**
 * Base state interface for any editor data store
 */
export interface EditorDataState<TGraph extends BaseGraph = BaseGraph> {
  /** Collection of graphs (keyed by ID) */
  graphs: Record<string, TGraph>;

  /** Currently active graph ID */
  currentGraphId: string | null;

  /** Context ID (e.g., worldId, projectId) */
  contextId: string | null;

  /** Whether there are unsaved changes */
  isDirty: boolean;

  /** Timestamp of last save */
  lastSavedAt: number | null;
}

/**
 * Base actions interface for editor data stores
 */
export interface EditorDataActions<TGraph extends BaseGraph = BaseGraph> {
  /** Set the context (e.g., world, project) */
  setContext: (contextId: string | null) => void;

  /** Load graphs from external source */
  loadGraphs: (graphs: Record<string, TGraph>) => void;

  /** Set the currently active graph */
  setCurrentGraph: (graphId: string | null) => void;

  /** Create a new graph */
  createGraph: (name: string) => string;

  /** Update an existing graph */
  updateGraph: (graphId: string, patch: Partial<TGraph>) => void;

  /** Delete a graph */
  deleteGraph: (graphId: string) => void;

  /** Duplicate a graph */
  duplicateGraph: (graphId: string) => string | null;

  /** Mark store as having unsaved changes */
  markDirty: () => void;

  /** Mark store as saved */
  markSaved: () => void;

  /** Reset store to initial state */
  reset: () => void;
}

/**
 * Combined editor store type
 */
export type EditorStore<TGraph extends BaseGraph = BaseGraph> =
  EditorDataState<TGraph> & EditorDataActions<TGraph>;

/**
 * Store with temporal (undo/redo) capabilities
 */
export interface StoreWithTemporal<TState> extends StoreApi<TState> {
  temporal?: StoreApi<TemporalState<Partial<TState>>>;
}

// ============================================================================
// Selection Store Types
// ============================================================================

/**
 * Selection state for editor UI
 */
export interface SelectionState {
  /** Currently selected single node ID */
  selectedNodeId: string | null;

  /** Currently selected single edge ID */
  selectedEdgeId: string | null;

  /** Multi-selection: selected node IDs */
  selectedNodeIds: string[];

  /** Multi-selection: selected edge IDs */
  selectedEdgeIds: string[];
}

/**
 * Selection store actions
 */
export interface SelectionActions {
  /** Select a single node (clears edge selection) */
  selectNode: (nodeId: string | null) => void;

  /** Select a single edge (clears node selection) */
  selectEdge: (edgeId: string | null) => void;

  /** Select multiple nodes */
  selectNodes: (nodeIds: string[]) => void;

  /** Select multiple edges */
  selectEdges: (edgeIds: string[]) => void;

  /** Clear all selection */
  clearSelection: () => void;

  /** Toggle node in multi-selection */
  toggleNodeSelection: (nodeId: string) => void;

  /** Toggle edge in multi-selection */
  toggleEdgeSelection: (edgeId: string) => void;
}

/**
 * Combined selection store type
 */
export type SelectionStore = SelectionState & SelectionActions;

// ============================================================================
// Editor Shell Component Types
// ============================================================================

/**
 * Layout configuration for EditorShell
 */
export interface EditorShellLayout {
  /** Show/hide the sidebar */
  showSidebar?: boolean;

  /** Initial sidebar width (default: 320) */
  sidebarWidth?: number;

  /** Sidebar position */
  sidebarPosition?: 'left' | 'right';

  /** Allow sidebar resize */
  resizableSidebar?: boolean;

  /** Show/hide the toolbar */
  showToolbar?: boolean;

  /** Toolbar position */
  toolbarPosition?: 'top' | 'bottom';
}

/**
 * Props for EditorShell component
 */
export interface EditorShellProps {
  /** Main content (graph surface) */
  children: ReactNode;

  /** Sidebar content (inspector) */
  sidebar?: ReactNode;

  /** Toolbar items (in addition to default undo/redo) */
  toolbarItems?: ReactNode;

  /** Header content (e.g., graph selector) */
  header?: ReactNode;

  /** Layout configuration */
  layout?: EditorShellLayout;

  /** Whether the editor has unsaved changes */
  isDirty?: boolean;

  /** Undo function (from temporal store) */
  onUndo?: () => void;

  /** Redo function (from temporal store) */
  onRedo?: () => void;

  /** Whether undo is available */
  canUndo?: boolean;

  /** Whether redo is available */
  canRedo?: boolean;

  /** Additional class name */
  className?: string;
}

/**
 * Props for EditorToolbar component
 */
export interface EditorToolbarProps {
  /** Undo function */
  onUndo?: () => void;

  /** Redo function */
  onRedo?: () => void;

  /** Whether undo is available */
  canUndo?: boolean;

  /** Whether redo is available */
  canRedo?: boolean;

  /** Whether there are unsaved changes */
  isDirty?: boolean;

  /** Save function */
  onSave?: () => void;

  /** Additional toolbar items */
  children?: ReactNode;

  /** Position */
  position?: 'left' | 'center' | 'right';

  /** Additional class name */
  className?: string;
}

// ============================================================================
// Editor Feature Factory Types
// ============================================================================

/**
 * Configuration for creating an editor feature
 */
export interface EditorFeatureConfig<
  TGraph extends BaseGraph = BaseGraph,
  TNodeType extends string = string
> {
  /** Unique identifier for the editor */
  id: string;

  /** Display name */
  name: string;

  /** Route path (e.g., '/routine-graph') */
  route: string;

  /** Icon name (from icon library) */
  icon: string;

  /** Icon color class */
  iconColor?: string;

  /** Description for the feature */
  description: string;

  /** Category (e.g., 'creation', 'tools') */
  category?: string;

  /** Module priority */
  priority?: number;

  /** Module dependencies */
  dependsOn?: string[];

  /** Available node types */
  nodeTypes: TNodeType[];

  /** Default graph factory */
  createDefaultGraph: (name: string) => TGraph;

  /** Default node factory */
  createDefaultNode: (type: TNodeType, position: Position) => TGraph['nodes'][0];

  /** Panel component */
  PanelComponent: ComponentType;

  /** App map for documentation */
  appMap?: {
    docs?: string[];
    backend?: string[];
  };
}

/**
 * Result of createEditorFeature factory
 */
export interface EditorFeatureResult {
  /** Module definition for registration */
  module: {
    id: string;
    name: string;
    priority?: number;
    dependsOn?: string[];
    initialize?: () => Promise<void>;
  };

  /** Page module definition */
  pageModule: {
    id: string;
    name: string;
    page: {
      route: string;
      icon: string;
      iconColor?: string;
      description: string;
      category?: string;
      featureId: string;
      featurePrimary: boolean;
      featured: boolean;
      component: ComponentType;
      appMap?: Record<string, string[]>;
    };
  };

  /** Store hook (if generated) */
  useStore?: () => unknown;

  /** Selection store hook (if generated) */
  useSelectionStore?: () => SelectionStore;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract node type from a graph type
 */
export type NodeOf<T extends BaseGraph> = T['nodes'][0];

/**
 * Extract edge type from a graph type
 */
export type EdgeOf<T extends BaseGraph> = T['edges'][0];

/**
 * Partialize function type for temporal middleware
 */
export type PartializeFn<T> = (state: T) => Partial<T>;
