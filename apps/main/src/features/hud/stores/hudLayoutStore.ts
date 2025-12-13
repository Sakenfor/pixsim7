import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '@lib/backendStorage';
import type { WorldHudLayout, HudRegionLayout, HudPreset } from '@features/hud';
import { createComposition } from '@lib/ui/composer/panelComposer';

/**
 * HUD Layout Store
 *
 * Part of Task 58 Phase 58.1 - HUD Layout Types & Store
 *
 * Manages HUD layouts for worlds, including CRUD operations and presets.
 * Uses the same widget composition system as panels (Task 50).
 */

export interface HudLayoutState {
  // All HUD layouts indexed by ID
  layouts: Record<string, WorldHudLayout>;

  // HUD presets for quick setup
  presets: Record<string, HudPreset>;

  // Schema version for migrations
  schemaVersion: number;
}

export interface HudLayoutActions {
  // Layout CRUD
  getLayout: (layoutId: string) => WorldHudLayout | undefined;
  getLayoutsForWorld: (worldId: number | string) => WorldHudLayout[];
  getDefaultLayoutForWorld: (worldId: number | string) => WorldHudLayout | undefined;
  createLayout: (worldId: number | string, name: string) => WorldHudLayout;
  updateLayout: (layoutId: string, updates: Partial<WorldHudLayout>) => void;
  deleteLayout: (layoutId: string) => void;
  setDefaultLayout: (worldId: number | string, layoutId: string) => void;

  // Region management
  addRegion: (layoutId: string, region: HudRegionLayout) => void;
  updateRegion: (layoutId: string, regionId: string, updates: Partial<HudRegionLayout>) => void;
  removeRegion: (layoutId: string, regionId: string) => void;

  // Preset management
  getPreset: (presetId: string) => HudPreset | undefined;
  getAllPresets: () => HudPreset[];
  applyPreset: (worldId: number | string, presetId: string, layoutName?: string) => WorldHudLayout | null;

  // Bulk operations
  cloneLayout: (layoutId: string, newName?: string) => WorldHudLayout | null;
  exportLayout: (layoutId: string) => string | null;
  importLayout: (json: string) => WorldHudLayout | null;

  // Reset
  reset: () => void;
}

// Default HUD presets
const defaultPresets: Record<string, HudPreset> = {
  'story-hud': {
    id: 'story-hud',
    name: 'Story HUD',
    description: 'Minimal HUD for story-focused gameplay',
    category: 'story',
    icon: '📖',
    layout: {
      name: 'Story HUD',
      regions: [
        {
          region: 'bottom',
          composition: createComposition('story-bottom', 'Story Bottom Bar', 12, 2),
          enabled: true,
        },
      ],
    },
  },
  'debug-hud': {
    id: 'debug-hud',
    name: 'Debug HUD',
    description: 'Comprehensive HUD with metrics and debug info',
    category: 'debug',
    icon: '🔧',
    layout: {
      name: 'Debug HUD',
      regions: [
        {
          region: 'top',
          composition: createComposition('debug-top', 'Debug Top Bar', 12, 2),
          enabled: true,
        },
        {
          region: 'left',
          composition: createComposition('debug-left', 'Debug Sidebar', 4, 8),
          enabled: true,
        },
        {
          region: 'right',
          composition: createComposition('debug-right', 'Debug Metrics', 4, 8),
          enabled: true,
        },
      ],
    },
  },
  'playtest-hud': {
    id: 'playtest-hud',
    name: 'Playtest HUD',
    description: 'Balanced HUD for playtesting',
    category: 'playtest',
    icon: '🎮',
    layout: {
      name: 'Playtest HUD',
      regions: [
        {
          region: 'top',
          composition: createComposition('playtest-top', 'Playtest Top Bar', 12, 1),
          enabled: true,
        },
        {
          region: 'bottom',
          composition: createComposition('playtest-bottom', 'Playtest Bottom Bar', 12, 2),
          enabled: true,
        },
      ],
    },
  },
};

const STORAGE_KEY = 'hud_layouts_v1';

export const useHudLayoutStore = create<HudLayoutState & HudLayoutActions>()(
  persist(
    (set, get) => ({
      // Initial state
      layouts: {},
      presets: defaultPresets,
      schemaVersion: 1,

      // Layout CRUD
      getLayout: (layoutId) => {
        return get().layouts[layoutId];
      },

      getLayoutsForWorld: (worldId) => {
        return Object.values(get().layouts).filter((layout) => layout.worldId === worldId);
      },

      getDefaultLayoutForWorld: (worldId) => {
        const layouts = get().getLayoutsForWorld(worldId);
        return layouts.find((layout) => layout.isDefault);
      },

      createLayout: (worldId, name) => {
        const layoutId = `hud-${worldId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const newLayout: WorldHudLayout = {
          id: layoutId,
          worldId,
          name,
          regions: [],
          isDefault: false,
          version: '1.0',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          layouts: {
            ...state.layouts,
            [layoutId]: newLayout,
          },
        }));

        return newLayout;
      },

      updateLayout: (layoutId, updates) => {
        set((state) => {
          const layout = state.layouts[layoutId];
          if (!layout) return state;

          return {
            layouts: {
              ...state.layouts,
              [layoutId]: {
                ...layout,
                ...updates,
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      deleteLayout: (layoutId) => {
        set((state) => {
          const { [layoutId]: _, ...remainingLayouts } = state.layouts;
          return { layouts: remainingLayouts };
        });
      },

      setDefaultLayout: (worldId, layoutId) => {
        set((state) => {
          const updatedLayouts = { ...state.layouts };

          // Unset existing default for this world
          Object.values(updatedLayouts).forEach((layout) => {
            if (layout.worldId === worldId && layout.isDefault) {
              updatedLayouts[layout.id] = { ...layout, isDefault: false };
            }
          });

          // Set new default
          const layout = updatedLayouts[layoutId];
          if (layout && layout.worldId === worldId) {
            updatedLayouts[layoutId] = { ...layout, isDefault: true };
          }

          return { layouts: updatedLayouts };
        });
      },

      // Region management
      addRegion: (layoutId, region) => {
        set((state) => {
          const layout = state.layouts[layoutId];
          if (!layout) return state;

          return {
            layouts: {
              ...state.layouts,
              [layoutId]: {
                ...layout,
                regions: [...layout.regions, region],
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      updateRegion: (layoutId, regionId, updates) => {
        set((state) => {
          const layout = state.layouts[layoutId];
          if (!layout) return state;

          return {
            layouts: {
              ...state.layouts,
              [layoutId]: {
                ...layout,
                regions: layout.regions.map((r) =>
                  r.region === regionId ? { ...r, ...updates } : r
                ),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      removeRegion: (layoutId, regionId) => {
        set((state) => {
          const layout = state.layouts[layoutId];
          if (!layout) return state;

          return {
            layouts: {
              ...state.layouts,
              [layoutId]: {
                ...layout,
                regions: layout.regions.filter((r) => r.region !== regionId),
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      // Preset management
      getPreset: (presetId) => {
        return get().presets[presetId];
      },

      getAllPresets: () => {
        return Object.values(get().presets);
      },

      applyPreset: (worldId, presetId, layoutName) => {
        const preset = get().getPreset(presetId);
        if (!preset) {
          console.warn(`Preset not found: ${presetId}`);
          return null;
        }

        const name = layoutName || `${preset.name} (${worldId})`;
        const layout = get().createLayout(worldId, name);

        // Apply preset configuration
        get().updateLayout(layout.id, {
          description: preset.description,
          regions: preset.layout.regions,
        });

        return get().getLayout(layout.id) || null;
      },

      // Bulk operations
      cloneLayout: (layoutId, newName) => {
        const layout = get().getLayout(layoutId);
        if (!layout) {
          console.warn(`Layout not found: ${layoutId}`);
          return null;
        }

        const name = newName || `${layout.name} (Copy)`;
        const newLayout = get().createLayout(layout.worldId, name);

        get().updateLayout(newLayout.id, {
          description: layout.description,
          regions: JSON.parse(JSON.stringify(layout.regions)), // Deep clone
        });

        return get().getLayout(newLayout.id) || null;
      },

      exportLayout: (layoutId) => {
        const layout = get().getLayout(layoutId);
        if (!layout) {
          console.warn(`Layout not found: ${layoutId}`);
          return null;
        }

        return JSON.stringify(layout, null, 2);
      },

      importLayout: (json) => {
        try {
          const layout = JSON.parse(json) as WorldHudLayout;

          // Generate new ID to avoid conflicts
          const newId = `hud-${layout.worldId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const importedLayout: WorldHudLayout = {
            ...layout,
            id: newId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          set((state) => ({
            layouts: {
              ...state.layouts,
              [newId]: importedLayout,
            },
          }));

          return importedLayout;
        } catch (error) {
          console.error('Failed to import HUD layout:', error);
          return null;
        }
      },

      // Reset
      reset: () => {
        set({
          layouts: {},
          presets: defaultPresets,
          schemaVersion: 1,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('hud-layouts'),
      version: 1,
    }
  )
);
