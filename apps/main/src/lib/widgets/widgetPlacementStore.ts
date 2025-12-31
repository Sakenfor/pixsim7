/**
 * Widget Placement Store
 *
 * Zustand store for managing widget instance placements.
 * Persists to localStorage so placements survive page reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WidgetInstance, WidgetSurface } from './types';

interface WidgetPlacementStore {
  /** Widget instances by ID */
  instances: Record<string, WidgetInstance>;

  /** Instance IDs per surface per area (e.g., header.left: ['clock-1', 'status-2']) */
  surfaceAreas: Record<string, Record<string, string[]>>;

  /** Add a widget instance */
  addInstance: (instance: WidgetInstance) => void;

  /** Remove a widget instance */
  removeInstance: (instanceId: string) => void;

  /** Update instance settings */
  updateInstanceSettings: (
    instanceId: string,
    settings: Record<string, unknown>
  ) => void;

  /** Move instance to different area or position */
  moveInstance: (
    instanceId: string,
    newArea: string,
    newOrder?: number
  ) => void;

  /** Get instances for a surface and area */
  getInstancesForArea: (
    surface: WidgetSurface,
    area: string
  ) => WidgetInstance[];

  /** Get all instances for a surface */
  getInstancesForSurface: (surface: WidgetSurface) => WidgetInstance[];

  /** Clear all instances for a surface */
  clearSurface: (surface: WidgetSurface) => void;
}

export const useWidgetPlacementStore = create<WidgetPlacementStore>()(
  persist(
    (set, get) => ({
      instances: {},
      surfaceAreas: {},

      addInstance: (instance) => {
        const area = instance.placement.area || 'default';
        const surfaceKey = instance.surface;

        set((state) => {
          // Add to instances
          const newInstances = {
            ...state.instances,
            [instance.id]: {
              ...instance,
              createdAt: instance.createdAt || Date.now(),
            },
          };

          // Add to surface area order
          const surfaceAreas = { ...state.surfaceAreas };
          if (!surfaceAreas[surfaceKey]) {
            surfaceAreas[surfaceKey] = {};
          }
          if (!surfaceAreas[surfaceKey][area]) {
            surfaceAreas[surfaceKey][area] = [];
          }
          surfaceAreas[surfaceKey][area] = [
            ...surfaceAreas[surfaceKey][area],
            instance.id,
          ];

          return { instances: newInstances, surfaceAreas };
        });
      },

      removeInstance: (instanceId) => {
        set((state) => {
          const instance = state.instances[instanceId];
          if (!instance) return state;

          // Remove from instances
          const { [instanceId]: removed, ...restInstances } = state.instances;

          // Remove from surface area order
          const surfaceAreas = { ...state.surfaceAreas };
          const surfaceKey = instance.surface;
          const area = instance.placement.area || 'default';

          if (surfaceAreas[surfaceKey]?.[area]) {
            surfaceAreas[surfaceKey][area] = surfaceAreas[surfaceKey][
              area
            ].filter((id) => id !== instanceId);
          }

          return { instances: restInstances, surfaceAreas };
        });
      },

      updateInstanceSettings: (instanceId, settings) => {
        set((state) => {
          const instance = state.instances[instanceId];
          if (!instance) return state;

          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...instance,
                settings: { ...instance.settings, ...settings },
              },
            },
          };
        });
      },

      moveInstance: (instanceId, newArea, newOrder) => {
        set((state) => {
          const instance = state.instances[instanceId];
          if (!instance) return state;

          const surfaceKey = instance.surface;
          const oldArea = instance.placement.area || 'default';

          // Update instance placement
          const newInstances = {
            ...state.instances,
            [instanceId]: {
              ...instance,
              placement: {
                ...instance.placement,
                area: newArea,
                order: newOrder,
              },
            },
          };

          // Update surface areas
          const surfaceAreas = { ...state.surfaceAreas };

          // Remove from old area
          if (surfaceAreas[surfaceKey]?.[oldArea]) {
            surfaceAreas[surfaceKey][oldArea] = surfaceAreas[surfaceKey][
              oldArea
            ].filter((id) => id !== instanceId);
          }

          // Add to new area
          if (!surfaceAreas[surfaceKey]) {
            surfaceAreas[surfaceKey] = {};
          }
          if (!surfaceAreas[surfaceKey][newArea]) {
            surfaceAreas[surfaceKey][newArea] = [];
          }

          const areaList = [...surfaceAreas[surfaceKey][newArea]];
          if (newOrder !== undefined && newOrder >= 0) {
            areaList.splice(newOrder, 0, instanceId);
          } else {
            areaList.push(instanceId);
          }
          surfaceAreas[surfaceKey][newArea] = areaList;

          return { instances: newInstances, surfaceAreas };
        });
      },

      getInstancesForArea: (surface, area) => {
        const state = get();
        const instanceIds = state.surfaceAreas[surface]?.[area] || [];
        return instanceIds
          .map((id) => state.instances[id])
          .filter(Boolean) as WidgetInstance[];
      },

      getInstancesForSurface: (surface) => {
        const state = get();
        const areas = state.surfaceAreas[surface] || {};
        const allIds = Object.values(areas).flat();
        return allIds
          .map((id) => state.instances[id])
          .filter(Boolean) as WidgetInstance[];
      },

      clearSurface: (surface) => {
        set((state) => {
          // Get all instance IDs for this surface
          const areas = state.surfaceAreas[surface] || {};
          const idsToRemove = Object.values(areas).flat();

          // Remove instances
          const newInstances = { ...state.instances };
          for (const id of idsToRemove) {
            delete newInstances[id];
          }

          // Clear surface areas
          const newSurfaceAreas = { ...state.surfaceAreas };
          delete newSurfaceAreas[surface];

          return { instances: newInstances, surfaceAreas: newSurfaceAreas };
        });
      },
    }),
    {
      name: 'widget-placements',
      version: 1,
    }
  )
);

/**
 * Hook to get widget instances for a specific surface area
 */
export function useWidgetInstances(
  surface: WidgetSurface,
  area?: string
): WidgetInstance[] {
  const store = useWidgetPlacementStore();
  if (area) {
    return store.getInstancesForArea(surface, area);
  }
  return store.getInstancesForSurface(surface);
}
