// Local wrapper around the shared pixcubes settings types.
// The actual persisted store still lives here so we can keep
// backend-synced preferences while sharing types with pixcubes.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import type { LinkingGesture } from '@pixsim7/scene.cubes';

interface CubeInputSettingsState {
  linkingGesture: LinkingGesture;
  setLinkingGesture: (gesture: LinkingGesture) => void;
  /** Auto-select operation type when adding assets to queue (e.g., video_extend for videos) */
  autoSelectOperationType: boolean;
  setAutoSelectOperationType: (enabled: boolean) => void;
}

const STORAGE_KEY = 'cube_settings_v1';

export const useCubeSettingsStore = create<CubeInputSettingsState>()(
  persist(
    (set) => ({
      linkingGesture: 'middleClick' as LinkingGesture,
      setLinkingGesture: (gesture) => set({ linkingGesture: gesture }),
      autoSelectOperationType: true, // Default: enabled for backward compatibility
      setAutoSelectOperationType: (enabled) => set({ autoSelectOperationType: enabled }),
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('cubeSettings'),
      partialize: (state) => ({
        linkingGesture: state.linkingGesture,
        autoSelectOperationType: state.autoSelectOperationType,
      }),
      version: 2, // Increment version for migration
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // Add autoSelectOperationType with default value for existing users
          return {
            ...persistedState,
            autoSelectOperationType: true,
          };
        }
        return persistedState;
      },
    }
  )
);

export type { LinkingGesture } from '@pixsim7/scene.cubes';
