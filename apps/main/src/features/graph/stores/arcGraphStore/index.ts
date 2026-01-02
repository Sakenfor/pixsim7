import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createBackendStorage } from '@lib/backendStorage';

import { arcGraphStorePartialize, createTemporalStore } from '@/stores/_shared/temporal';

import { createArcGraphSlice } from './arcGraphSlice';
import { createArcImportExportSlice } from './arcImportExportSlice';
import { createArcNavigationSlice } from './arcNavigationSlice';
import { createArcNodeSlice } from './arcNodeSlice';
import type { ArcGraphState } from './types';

/**
 * Arc Graph Store
 *
 * Manages arc/quest graphs that sit above the scene graph.
 * Supports:
 * - Arc graph CRUD operations
 * - Arc node management (arc, quest, milestone nodes)
 * - Navigation and drill-down to scenes
 * - Import/export functionality
 */

export const useArcGraphStore = create<ArcGraphState>()(
  devtools(
    persist(
      createTemporalStore(
        (set, get, api) => ({
          ...createArcGraphSlice(set, get, api),
          ...createArcNodeSlice(set, get, api),
          ...createArcNavigationSlice(set, get, api),
          ...createArcImportExportSlice(set, get, api),
        }),
        {
          limit: 50,
          partialize: arcGraphStorePartialize,
        }
      ),
      {
        name: 'arc-graph-storage',
        storage: createBackendStorage(),
      }
    ),
    {
      name: 'ArcGraphStore',
    }
  )
);

// Export temporal actions for undo/redo
export const useArcGraphStoreUndo = () => useArcGraphStore.temporal.undo;
export const useArcGraphStoreRedo = () => useArcGraphStore.temporal.redo;
export const useArcGraphStoreCanUndo = () => useArcGraphStore.temporal.getState().pastStates.length > 0;
export const useArcGraphStoreCanRedo = () => useArcGraphStore.temporal.getState().futureStates.length > 0;

// Export types for use in components
export type { ArcGraphState } from './types';
