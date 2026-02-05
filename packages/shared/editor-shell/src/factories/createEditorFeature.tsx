/**
 * Editor Feature Factory
 *
 * High-level factory for creating complete editor features.
 * Generates stores, modules, and routes from a single configuration.
 */

import { lazy, type ComponentType } from 'react';
import { generateGraphId } from '@pixsim7/shared.graph.utilities';
import {
  createEditorStore,
  createEditorSelectors,
  createTemporalSelectors,
  createTemporalHooks,
} from '../stores/createEditorStore';
import { createSelectionStore, createSelectionSelectors } from '../stores/createSelectionStore';
import type { BaseGraph, Position, EditorFeatureConfig, EditorFeatureResult } from '../types';

// ============================================================================
// Feature Factory
// ============================================================================

/**
 * Create a complete editor feature from configuration
 *
 * This is the main entry point for creating new graph-based editors.
 * It generates all the necessary stores, modules, and exports.
 *
 * @example
 * ```typescript
 * const routineGraphFeature = createEditorFeature({
 *   id: 'routine-graph',
 *   name: 'Routine Graph Editor',
 *   route: '/routine-graph',
 *   icon: 'clock',
 *   description: 'Design NPC daily routines',
 *   nodeTypes: ['time_slot', 'decision', 'activity'],
 *   createDefaultGraph: (name) => ({ ... }),
 *   createDefaultNode: (type, position) => ({ ... }),
 *   PanelComponent: RoutineGraphPanel,
 * });
 *
 * // Export for module registration
 * export const { module, pageModule, useStore, useSelectionStore } = routineGraphFeature;
 * ```
 */
export function createEditorFeature<
  TGraph extends BaseGraph,
  TNodeType extends string = string
>(config: EditorFeatureConfig<TGraph, TNodeType>): EditorFeatureResult {
  const {
    id,
    name,
    route,
    icon,
    iconColor,
    description,
    category = 'creation',
    priority = 70,
    dependsOn = ['graph-system'],
    createDefaultGraph,
    PanelComponent,
    appMap,
  } = config;

  // Create the data store
  const useStore = createEditorStore<TGraph>({
    name: id,
    graphIdPrefix: id,
    createDefaultGraph: (graphName: string) => ({
      ...createDefaultGraph(graphName),
      id: generateGraphId(id),
    }),
  });

  // Create the selection store
  const useSelectionStore = createSelectionStore({
    name: `${id}-selection`,
  });

  // Create selectors
  const selectors = createEditorSelectors<TGraph>();
  const temporalSelectors = createTemporalSelectors(useStore);
  const selectionSelectors = createSelectionSelectors();
  const { useUndo, useRedo } = createTemporalHooks(useStore);

  // Create module definition
  const module = {
    id,
    name,
    priority,
    dependsOn,
    async initialize() {
      // Module initialization (e.g., register with plugin system)
      // This can be extended by the consumer
    },
  };

  // Create page module definition
  const pageModule = {
    id: `${id}-page`,
    name,
    page: {
      route,
      icon,
      iconColor,
      description,
      category,
      featureId: id,
      featurePrimary: true,
      featured: true,
      component: PanelComponent,
      appMap,
    },
  };

  return {
    module,
    pageModule,
    useStore: useStore as any,
    useSelectionStore,
  };
}

// ============================================================================
// Module Helpers
// ============================================================================

/**
 * Create a lazy-loaded route component
 *
 * @example
 * ```typescript
 * const component = createLazyRoute(
 *   () => import('./RoutineGraphRoute'),
 *   'RoutineGraphRoute'
 * );
 * ```
 */
export function createLazyRoute<T extends ComponentType<any>>(
  importFn: () => Promise<{ [key: string]: T }>,
  exportName: string
): React.LazyExoticComponent<T> {
  return lazy(() =>
    importFn().then((module) => ({ default: module[exportName] }))
  );
}

/**
 * Create a simple route wrapper component
 *
 * @example
 * ```typescript
 * const RoutineGraphRoute = createRouteWrapper(RoutineGraphPanel);
 * ```
 */
export function createRouteWrapper(PanelComponent: ComponentType): ComponentType {
  return function RouteWrapper() {
    return (
      <div className="h-full w-full">
        <PanelComponent />
      </div>
    );
  };
}

// ============================================================================
// Store Extension Helpers
// ============================================================================

/**
 * Create node CRUD actions for an editor store
 *
 * This helper generates standard node operations that can be
 * merged into additional store actions.
 */
export function createNodeActions<TGraph extends BaseGraph, TNode extends TGraph['nodes'][0]>(
  createDefaultNode: (type: string, position: Position) => TNode,
  graphIdPrefix: string
) {
  return (
    set: (partial: any) => void,
    get: () => any
  ) => ({
    addNode: (node: TNode) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      const updated = {
        ...graph,
        nodes: [...graph.nodes, node],
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    updateNode: (nodeId: string, patch: Partial<TNode>) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      const updated = {
        ...graph,
        nodes: graph.nodes.map((n: TNode) =>
          n.id === nodeId ? { ...n, ...patch } : n
        ),
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    removeNode: (nodeId: string) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      const updated = {
        ...graph,
        nodes: graph.nodes.filter((n: TNode) => n.id !== nodeId),
        edges: graph.edges.filter(
          (e: any) => e.from !== nodeId && e.to !== nodeId
        ),
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    addNodeOfType: (type: string, position: Position) => {
      const { currentGraphId } = get();
      if (!currentGraphId) return null;

      const node = createDefaultNode(type, position);
      get().addNode(node);
      return node.id;
    },
  });
}

/**
 * Create edge CRUD actions for an editor store
 */
export function createEdgeActions<TGraph extends BaseGraph, TEdge extends TGraph['edges'][0]>() {
  return (
    set: (partial: any) => void,
    get: () => any
  ) => ({
    addEdge: (edge: TEdge) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      // Check for duplicate
      const exists = graph.edges.some(
        (e: TEdge) => e.from === edge.from && e.to === edge.to
      );
      if (exists) return;

      const updated = {
        ...graph,
        edges: [...graph.edges, edge],
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    updateEdge: (edgeId: string, patch: Partial<TEdge>) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      const updated = {
        ...graph,
        edges: graph.edges.map((e: TEdge) =>
          e.id === edgeId ? { ...e, ...patch } : e
        ),
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    removeEdge: (edgeId: string) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return;

      const graph = graphs[currentGraphId];
      if (!graph) return;

      const updated = {
        ...graph,
        edges: graph.edges.filter((e: TEdge) => e.id !== edgeId),
        updatedAt: new Date().toISOString(),
      };

      set({
        graphs: { ...graphs, [currentGraphId]: updated },
        isDirty: true,
      });
    },

    connectNodes: (fromId: string, toId: string, edgeFactory: (from: string, to: string) => TEdge) => {
      const { currentGraphId, graphs } = get();
      if (!currentGraphId) return null;

      const graph = graphs[currentGraphId];
      if (!graph) return null;

      // Validate nodes exist
      const fromNode = graph.nodes.find((n: any) => n.id === fromId);
      const toNode = graph.nodes.find((n: any) => n.id === toId);
      if (!fromNode || !toNode) return null;

      // Check for duplicate
      const exists = graph.edges.some(
        (e: TEdge) => e.from === fromId && e.to === toId
      );
      if (exists) {
        const existing = graph.edges.find(
          (e: TEdge) => e.from === fromId && e.to === toId
        );
        return existing?.id ?? null;
      }

      const edge = edgeFactory(fromId, toId);
      get().addEdge(edge);
      return edge.id;
    },
  });
}
