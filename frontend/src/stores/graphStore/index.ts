import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { GraphState } from './types';
import type { DraftSceneNode } from '../../modules/scene-builder';
import { createSceneSlice } from './sceneSlice';
import { createSignatureSlice } from './signatureSlice';
import { createNodeSlice } from './nodeSlice';
import { createNodeGroupSlice } from './nodeGroupSlice';
import { createNavigationSlice } from './navigationSlice';
import { createCrossSceneSlice } from './crossSceneSlice';
import { createImportExportSlice } from './importExportSlice';
import { logEvent } from '../../lib/logging';

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

          // Legacy compatibility layer
          get draft(): ReturnType<GraphState['getCurrentScene']> {
            return (this as unknown as GraphState).getCurrentScene();
          },

          createDraft: (title: string) => {
            const state = get() as GraphState;
            state.createScene(title);
          },

          clearDraft: () => {
            const state = get() as GraphState;
            if (state.currentSceneId) {
              state.deleteScene(state.currentSceneId);
            }
          },

          // Legacy export/import (operate on current scene)
          exportDraft: () => {
            const state = get() as GraphState;
            if (!state.currentSceneId) return null;
            return state.exportScene(state.currentSceneId);
          },

          importDraft: (jsonString: string) => {
            const state = get() as GraphState;
            const sceneId = state.importScene(jsonString);
            return sceneId ? state.getScene(sceneId) : null;
          },

          // Legacy toRuntimeScene (no args, uses current scene)
          toRuntimeScene: (sceneId?: string): ReturnType<GraphState['toRuntimeScene']> => {
            const state: GraphState = get() as GraphState;
            const targetSceneId = sceneId || state.currentSceneId;
            if (!targetSceneId) return null;

            const scene = state.scenes[targetSceneId];
            if (!scene || !scene.startNodeId) return null;

            return {
              id: scene.id,
              title: scene.title,
              startNodeId: scene.startNodeId,
              nodes: scene.nodes.map((d: DraftSceneNode) => ({
                id: d.id,
                type: 'video',
                label: d.metadata?.label,
                media: d.segments,
                selection: d.selection,
                playback: d.playback,
                meta: d.metadata,
              })),
              edges:
                scene.edges.length > 0
                  ? scene.edges.map((e: any, i: number) => ({
                      id: e.id || `edge_${i}`,
                      from: e.from,
                      to: e.to,
                      label: 'Continue',
                      isDefault: e.meta?.fromPort === 'default',
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
        name: 'scene-graph-v2',
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

// Re-export types for convenience
export type { GraphState, NodeGroupManagementState, NavigationState } from './types';
