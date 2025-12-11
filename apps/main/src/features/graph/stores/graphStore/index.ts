import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { GraphState } from './types';
import type { DraftSceneNode } from '@/modules/scene-builder';
import { createSceneSlice } from './sceneSlice';
import { createSignatureSlice } from './signatureSlice';
import { createNodeSlice } from './nodeSlice';
import { createNodeGroupSlice } from './nodeGroupSlice';
import { createNavigationSlice } from './navigationSlice';
import { createCrossSceneSlice } from './crossSceneSlice';
import { createImportExportSlice } from './importExportSlice';
import { logEvent } from '@/lib/logging';
import { createBackendStorage } from '@/lib/backendStorage';
import { createTemporalStore, graphStorePartialize } from '@/stores/_shared/temporal';

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
            const convertNode = (d: DraftSceneNode): any => {
              const base = {
                id: d.id,
                type: d.type,
                label: d.metadata?.label,
                meta: d.metadata,
              };

              // Type-specific conversions
              switch (d.type) {
                case 'video':
                  return {
                    ...base,
                    media: d.segments,
                    selection: d.selection,
                    playback: d.playback,
                  };

                case 'choice':
                  return {
                    ...base,
                    choices: (d.metadata as any)?.choices || [],
                  };

                case 'condition':
                  return {
                    ...base,
                    condition: (d.metadata as any)?.condition,
                    trueTargetNodeId: (d.metadata as any)?.trueTargetNodeId,
                    falseTargetNodeId: (d.metadata as any)?.falseTargetNodeId,
                  };

                case 'scene_call':
                  return {
                    ...base,
                    targetSceneId: (d as any).targetSceneId,
                    parameterBindings: (d as any).parameterBindings,
                    returnRouting: (d as any).returnRouting,
                  };

                case 'return':
                  return {
                    ...base,
                    returnPointId: (d as any).returnPointId,
                    returnValues: (d as any).returnValues,
                  };

                case 'end':
                  return {
                    ...base,
                    endType: (d.metadata as any)?.endConfig?.endType || 'neutral',
                    endMessage: (d.metadata as any)?.endConfig?.message,
                  };

                case 'node_group':
                  // Node groups don't appear in runtime, they're editor-only
                  return null;

                case 'generation':
                  return {
                    ...base,
                    // Generation nodes need special handling
                  };

                default:
                  // Fallback for unknown types
                  return base;
              }
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
                  ? scene.edges.map((e: any, i: number) => ({
                      id: e.id || `edge_${i}`,
                      from: e.from,
                      to: e.to,
                      label: e.meta?.label || 'Continue',
                      isDefault: e.meta?.fromPort === 'default',
                      conditions: e.meta?.conditions,
                      effects: e.meta?.effects,
                    }))
                  : scene.nodes.flatMap((d: any) =>
                      (d.connections || []).map((to: string, i: number) => ({
                        id: `${d.id}_edge_${i}`,
                        from: d.id,
                        to,
                        label: 'Continue',
                        isDefault: true,
                      }))
                    ),
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
