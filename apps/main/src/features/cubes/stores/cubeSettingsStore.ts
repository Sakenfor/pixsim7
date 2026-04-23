/**
 * Cube Settings Store
 *
 * Persists cube overlay defaults (visibility, formation, active face, dock position).
 * Factory pattern: `createCubeSettingsStore(instanceId)` for multiple cube instances.
 * The default singleton is `useCubeSettingsStore` (instanceId = 'default').
 */

import type { FormationPattern } from '@pixsim7/pixcubes';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage } from '@lib/backendStorage';

/**
 * Which face of the cube indicator is active.
 * String type so dynamically-registered faces work; built-in IDs are
 * 'panels' | 'launcher' | 'pinned' | 'recent' | 'top' | 'bottom'.
 */
export type CubeFaceMode = string;

/** Where the cube is docked. 'floating' = free-drag anywhere. */
export type CubeDockPosition = 'floating' | 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-left' | 'top-right';

export interface CubeSettingsState {
  visible: boolean;
  formation: FormationPattern;
  activeFace: CubeFaceMode;
  dockPosition: CubeDockPosition;
  /** Last free-drag position. Only meaningful when dockPosition === 'floating'. */
  floatingPos: { x: number; y: number } | null;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => boolean;
  setFormation: (formation: FormationPattern) => void;
  setActiveFace: (face: CubeFaceMode) => void;
  setDockPosition: (pos: CubeDockPosition) => void;
  setFloatingPos: (pos: { x: number; y: number }) => void;
}

/** Create a cube settings store for a given instance. */
export function createCubeSettingsStore(instanceId: string) {
  // Use the legacy key for 'default' to preserve existing persisted state.
  const storageKey = instanceId === 'default' ? 'cubeSettings' : `cubeSettings:${instanceId}`;

  return create<CubeSettingsState>()(
    persist(
      (set, get) => ({
        visible: true,
        formation: 'arc',
        activeFace: 'panels',
        dockPosition: 'floating',
        floatingPos: null,
        setVisible: (visible) => set({ visible }),
        toggleVisible: () => {
          const next = !get().visible;
          set({ visible: next });
          return next;
        },
        setFormation: (formation) => set({ formation }),
        setActiveFace: (face) => set({ activeFace: face }),
        setDockPosition: (dockPosition) => set({ dockPosition }),
        setFloatingPos: (floatingPos) => set({ floatingPos }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => createBackendStorage(storageKey)),
      },
    ),
  );
}

// ── Memoized instance map ──

const instances = new Map<string, ReturnType<typeof createCubeSettingsStore>>();

/** Get (or create) a cube settings store for the given instance. */
export function getCubeSettingsStore(instanceId: string): ReturnType<typeof createCubeSettingsStore> {
  let store = instances.get(instanceId);
  if (!store) {
    store = createCubeSettingsStore(instanceId);
    instances.set(instanceId, store);
  }
  return store;
}

/** Default singleton — backward-compatible with all existing imports. */
export const useCubeSettingsStore = getCubeSettingsStore('default');
