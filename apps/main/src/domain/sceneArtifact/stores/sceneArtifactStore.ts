import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createTemporalStore } from '@/stores/_shared/temporal';

import type {
  SceneArtifact,
  SceneArtifactUpsertInput,
} from '../types';

interface SceneArtifactState {
  artifacts: Record<string, SceneArtifact>;
  currentArtifactId: string | null;

  upsertPrepArtifact: (input: SceneArtifactUpsertInput) => string;
  getArtifact: (id: string) => SceneArtifact | null;
  deleteArtifact: (id: string) => void;
  setCurrentArtifact: (id: string | null) => void;
  listArtifacts: () => SceneArtifact[];

  exportArtifact: (id: string) => string | null;
  importArtifact: (json: string) => string | null;
}

function sortArtifacts(artifacts: Record<string, SceneArtifact>): SceneArtifact[] {
  return Object.values(artifacts).sort((a, b) => {
    const aa = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const bb = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return bb - aa;
  });
}

export const useSceneArtifactStore = create<SceneArtifactState>()(
  devtools(
    createTemporalStore(
      (set, get) => ({
        artifacts: {},
        currentArtifactId: null,

        upsertPrepArtifact: (input) => {
          const nowIso = new Date().toISOString();
          const existingId = input.artifactId && get().artifacts[input.artifactId]
            ? input.artifactId
            : null;
          const id = existingId ?? crypto.randomUUID();
          const prev = existingId ? get().artifacts[existingId] : null;
          const next: SceneArtifact = {
            id,
            title: input.title,
            status: input.status,
            prep: structuredClone(input.prep),
            gameSceneId: input.gameSceneId ?? prev?.gameSceneId ?? null,
            tags: prev?.tags ?? [],
            metadata: {
              ...(prev?.metadata ?? {}),
              ...(input.metadata ?? {}),
            },
            version: prev?.version ?? 1,
            createdAt: prev?.createdAt ?? nowIso,
            updatedAt: nowIso,
          };
          set((state) => ({
            artifacts: {
              ...state.artifacts,
              [id]: next,
            },
            currentArtifactId: id,
          }));
          return id;
        },

        getArtifact: (id) => get().artifacts[id] ?? null,

        deleteArtifact: (id) => {
          set((state) => {
            const { [id]: removed, ...rest } = state.artifacts;
            void removed;
            return {
              artifacts: rest,
              currentArtifactId: state.currentArtifactId === id ? null : state.currentArtifactId,
            };
          });
        },

        setCurrentArtifact: (id) => set({ currentArtifactId: id }),

        listArtifacts: () => sortArtifacts(get().artifacts),

        exportArtifact: (id) => {
          const artifact = get().artifacts[id];
          return artifact ? JSON.stringify(artifact, null, 2) : null;
        },

        importArtifact: (json) => {
          try {
            const artifact = JSON.parse(json) as SceneArtifact;
            if (!artifact?.id) return null;
            set((state) => ({
              artifacts: {
                ...state.artifacts,
                [artifact.id]: {
                  ...artifact,
                  updatedAt: new Date().toISOString(),
                },
              },
              currentArtifactId: artifact.id,
            }));
            return artifact.id;
          } catch (error) {
            console.error('Failed to import scene artifact:', error);
            return null;
          }
        },
      }),
      {
        limit: 50,
        partialize: (state) => {
          const { currentArtifactId, ...tracked } = state as any;
          void currentArtifactId;
          return tracked as Partial<SceneArtifactState>;
        },
      },
    ),
    { name: 'SceneArtifactStore' },
  ),
);

export const useSceneArtifactStoreUndo = () => useSceneArtifactStore.temporal.getState().undo;
export const useSceneArtifactStoreRedo = () => useSceneArtifactStore.temporal.getState().redo;
export const useSceneArtifactStoreCanUndo = () => useSceneArtifactStore.temporal.getState().pastStates.length > 0;
export const useSceneArtifactStoreCanRedo = () => useSceneArtifactStore.temporal.getState().futureStates.length > 0;
