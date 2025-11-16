import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';

export type LinkingGesture = 'middleClick' | 'shiftLeftClick';

interface CubeInputSettingsState {
  linkingGesture: LinkingGesture;
  setLinkingGesture: (gesture: LinkingGesture) => void;
}

const STORAGE_KEY = 'cube_settings_v1';

export const useCubeSettingsStore = create<CubeInputSettingsState>()(
  persist(
    (set) => ({
      linkingGesture: 'middleClick',
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

