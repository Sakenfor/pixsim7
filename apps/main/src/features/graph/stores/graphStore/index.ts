import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

import { createBackendStorage } from '@lib/backendStorage';
import { sceneNodeTypeRegistry, type Scene } from '@lib/registries';
import { logEvent } from '@lib/utils/logging';

import { createTemporalStore, graphStorePartialize } from '@/stores/_shared/temporal';

import type { DraftSceneNode } from '@domain/sceneBuilder';

import { createCrossSceneSlice } from './crossSceneSlice';
import { createImportExportSlice } from './importExportSlice';
import { createNavigationSlice } from './navigationSlice';
import { createNodeGroupSlice } from './nodeGroupSlice';
import { createNodeSlice } from './nodeSlice';
import { createSceneSlice } from './sceneSlice';
import { createSignatureSlice } from './signatureSlice';
import type { GraphState } from './types';

/**
 * Graph Store - Multi-Scene Architecture (Modular)
 *
 * Supports scene-as-function pattern with clean separation of concerns:
 * - sceneSlice: Scene CRUD operations
 * - signatureSlice: Parameter and return point management
 * - nodeSlice: Node operations on current scene
 * - crossSceneSlice: Cross-scene references and validation
 * - importExportSlice: Import/export and runtime conversion
 *
 * Migration from v1 (single draft) to v2 (multi-scene) is automatic.
 */

export const useGraphStore = create<GraphState>()(
  devtools(
    persist(
      createTemporalStore(
        (set, get, api) => {
          const slices = {
            ...createSceneSlice(set, get, api),
            ...createSignatureSlice(set, get, api),
            ...createNodeSlice(set, get, api),
            ...createNodeGroupSlice(set, get, api),
            ...createNavigationSlice(set, get, api),
            ...createCrossSceneSlice(set, get, api),
            ...createImportExportSlice(set, get, api),
          };

          return {
            ...slices,

            // Runtime scene conversion
            toRuntimeScene: (sceneId?: string): ReturnType<GraphState['toRuntimeScene']> => {
              const state: GraphState = get() as GraphState;
              const targetSceneId = sceneId || state.currentSceneId;
              if (!targetSceneId) return null;

              const scene = state.scenes[targetSceneId];
              if (!scene || !scene.startNodeId) return null;

              // Helper to convert draft node to runtime node
              type RuntimeNode = Scene['nodes'][number];

              const convertNode = (d: DraftSceneNode): RuntimeNode | null => {
                const base: RuntimeNode = {
                  nodeType: 'scene_content',
                  id: d.id,
                  type: d.type,
                  label: d.metadata?.label,
                  meta: d.metadata,
                };

                const typeDef = sceneNodeTypeRegistry.getSync(d.type);
                const runtimeNode = typeDef?.toRuntime?.(d);

                if (runtimeNode === null) {
                  return null;
                }

                if (runtimeNode !== undefined) {
                  return runtimeNode;
                }

                return base;
              };

              return {
                id: scene.id,
                title: scene.title,
                startNodeId: scene.startNodeId,
                meta: scene.metadata, // Include scene metadata (arc_id, tags, etc.)
                nodes: scene.nodes
                  .map(convertNode)
                  .filter((n): n is NonNullable<typeof n> => n !== null),
                edges:
                  scene.edges.length > 0
                    ? scene.edges.map((edge, index) => ({
                        id: edge.id || `edge_${index}`,
                        from: edge.from,
                        to: edge.to,
                        label: edge.meta?.label || 'Continue',
                        isDefault: edge.meta?.fromPort === 'default',
                        conditions: edge.meta?.conditions,
                        effects: edge.meta?.effects,
                      }))
                    : scene.nodes.flatMap((node) => {
                        const legacyNode = node as DraftSceneNode & { connections?: string[] };
                        const connections = Array.isArray(legacyNode.connections)
                          ? legacyNode.connections
                          : [];
                        return connections.map((to, index) => ({
                          id: `${node.id}_edge_${index}`,
                          from: node.id,
                          to,
                          label: 'Continue',
                          isDefault: true,
                        }));
                      }),
              };
            },
          };
        },
        {
          limit: 50,
          partialize: graphStorePartialize,
        }
      ),
      {
        name: 'scene-graph-v2',
        storage: createBackendStorage('sceneGraph'),
        version: 2,
        partialize: (state) => ({
          scenes: state.scenes,
          currentSceneId: state.currentSceneId,
          sceneMetadata: state.sceneMetadata,
        }),
        migrate: (persistedState: unknown, version: number) => {
          // Migrate from v1 (single draft) to v2 (multi-scene)
          if (version === 1 && persistedState.draft) {
            const legacyDraft = persistedState.draft;
            const sceneId = legacyDraft.id || `scene_${Date.now()}`;

            logEvent('INFO', 'graph_store_migration', { from: 'v1', to: 'v2', sceneId });
            return {
              scenes: {
                [sceneId]: legacyDraft,
              },
              currentSceneId: sceneId,
              sceneMetadata: {},
            };
          }

          return persistedState;
        },
      }
    ),
    { name: 'GraphStore' }
  )
);

// Export temporal actions for undo/redo
export const useGraphStoreUndo = () => useGraphStore.temporal.undo;
export const useGraphStoreRedo = () => useGraphStore.temporal.redo;
export const useGraphStoreCanUndo = () => useGraphStore.temporal.getState().pastStates.length > 0;
export const useGraphStoreCanRedo = () => useGraphStore.temporal.getState().futureStates.length > 0;

// Re-export types for convenience
export type { GraphState, NodeGroupManagementState, NavigationState } from './types';

// Re-export selectors for convenience
export * from './selectors';
