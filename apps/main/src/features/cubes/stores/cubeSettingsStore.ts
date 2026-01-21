/**
 * Cube Settings Store
 *
 * Persists cube overlay defaults (visibility, formation).
 */

import type { FormationPattern } from '@pixsim7/pixcubes';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { createBackendStorage } from '@lib/backendStorage';

interface CubeSettingsState {
  visible: boolean;
  formation: FormationPattern;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => boolean;
  setFormation: (formation: FormationPattern) => void;
}

const STORAGE_KEY = 'cubeSettings';

export const useCubeSettingsStore = create<CubeSettingsState>()(
  persist(
    (set, get) => ({
      visible: true,
      formation: 'arc',
      setVisible: (visible) => set({ visible }),
      toggleVisible: () => {
        const next = !get().visible;
        set({ visible: next });
        return next;
      },
      setFormation: (formation) => set({ formation }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage(STORAGE_KEY)),
    }
  )
);
