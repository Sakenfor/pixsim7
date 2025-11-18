import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { ArcGraphState } from './types';
import { createArcGraphSlice } from './arcGraphSlice';
import { createArcNodeSlice } from './arcNodeSlice';
import { createArcNavigationSlice } from './arcNavigationSlice';
import { createArcImportExportSlice } from './arcImportExportSlice';
import { createBackendStorage } from '../../lib/backendStorage';

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
      (set, get, api) => ({
        ...createArcGraphSlice(set, get, api),
        ...createArcNodeSlice(set, get, api),
        ...createArcNavigationSlice(set, get, api),
        ...createArcImportExportSlice(set, get, api),
      }),
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

// Export types for use in components
export type { ArcGraphState } from './types';
