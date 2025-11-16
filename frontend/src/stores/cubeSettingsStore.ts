// Local wrapper around the shared pixcubes settings types.
// The actual persisted store still lives here so we can keep
// backend-synced preferences while sharing types with pixcubes.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import type { LinkingGesture } from 'pixcubes';

interface CubeInputSettingsState {
  linkingGesture: LinkingGesture;
  setLinkingGesture: (gesture: LinkingGesture) => void;
}

const STORAGE_KEY = 'cube_settings_v1';

export const useCubeSettingsStore = create<CubeInputSettingsState>()(
  persist(
    (set) => ({
      linkingGesture: 'middleClick' as LinkingGesture,
      setLinkingGesture: (gesture) => set({ linkingGesture: gesture }),
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('cubeSettings'),
      partialize: (state) => ({
        linkingGesture: state.linkingGesture,
      }),
      version: 1,
    }
  )
);

export type { LinkingGesture } from 'pixcubes';
