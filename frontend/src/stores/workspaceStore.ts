import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import type { MosaicNode } from 'react-mosaic-component';

export type PanelId =
  | 'gallery'
  | 'scene'
  | 'graph'
  | 'inspector'
  | 'health'
  | 'game'
  | 'providers'
  | 'settings';

export interface FloatingPanelState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  layout: MosaicNode<PanelId> | null;
}

export interface WorkspaceState {
  currentLayout: MosaicNode<PanelId> | null; // Legacy mosaic layout
  dockviewLayout: any | null; // Dockview serialized layout
  closedPanels: PanelId[];
  isLocked: boolean;
  presets: WorkspacePreset[];
  fullscreenPanel: PanelId | null;
  floatingPanels: FloatingPanelState[];
}

export interface WorkspaceActions {
  setLayout: (layout: MosaicNode<PanelId> | null) => void;
  setDockviewLayout: (layout: any) => void;
  closePanel: (panelId: PanelId) => void;
  restorePanel: (panelId: PanelId) => void;
  clearClosedPanels: () => void;
  toggleLock: () => void;
  setFullscreen: (panelId: PanelId | null) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  reset: () => void;
  openFloatingPanel: (panelId: PanelId, x?: number, y?: number, width?: number, height?: number) => void;
  closeFloatingPanel: (panelId: PanelId) => void;
  minimizeFloatingPanel: (panelId: PanelId) => void;
  restoreFloatingPanel: (panelState: FloatingPanelState) => void;
  updateFloatingPanelPosition: (panelId: PanelId, x: number, y: number) => void;
  updateFloatingPanelSize: (panelId: PanelId, width: number, height: number) => void;
  bringFloatingPanelToFront: (panelId: PanelId) => void;
}

// Default presets
const defaultPresets: WorkspacePreset[] = [
  {
    id: 'default',
    name: 'Default Workspace',
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'gallery',
        second: 'health',
        splitPercentage: 70,
      },
      second: {
        direction: 'row',
        first: 'graph',
        second: {
          direction: 'column',
          first: 'inspector',
          second: 'game',
          splitPercentage: 40,
        },
        splitPercentage: 60,
      },
      splitPercentage: 20,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal (Graph + Game)',
    layout: {
      direction: 'row',
      first: 'graph',
      second: 'game',
      splitPercentage: 60,
    },
  },
  {
    id: 'creative',
    name: 'Creative Studio',
    layout: {
      direction: 'row',
      first: 'gallery',
      second: {
        direction: 'column',
        first: 'scene',
        second: 'game',
        splitPercentage: 50,
      },
      splitPercentage: 25,
    },
  },
];

const STORAGE_KEY = 'workspace_v2';

// Helper to get all leaf IDs from a layout tree
const getAllLeaves = (node: MosaicNode<PanelId> | null): PanelId[] => {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
};

// Helper to validate and fix duplicate IDs in a layout
const validateAndFixLayout = (layout: MosaicNode<PanelId> | null): MosaicNode<PanelId> | null => {
  if (!layout) return null;

  const leaves = getAllLeaves(layout);
  const uniqueLeaves = Array.from(new Set(leaves));

  // If no duplicates, return original layout
  if (leaves.length === uniqueLeaves.length) {
    return layout;
  }

  // Detected duplicate IDs in layout, resetting to default
  return defaultPresets[0].layout;
};

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      currentLayout: defaultPresets[0].layout,
      dockviewLayout: null,
      closedPanels: [],
      isLocked: false,
      presets: defaultPresets,
      fullscreenPanel: null,
      floatingPanels: [],

      setLayout: (layout) => {
        if (get().isLocked) return;
        const validatedLayout = validateAndFixLayout(layout);
        set({ currentLayout: validatedLayout });
      },

      setDockviewLayout: (layout) => {
        if (get().isLocked) return;
        set({ dockviewLayout: layout });
      },

      closePanel: (panelId) => {
        const closedPanels = get().closedPanels;
        if (!closedPanels.includes(panelId)) {
          set({ closedPanels: [...closedPanels, panelId] });
        }
      },

      restorePanel: (panelId) => {
        const current = get().currentLayout;
        const closedPanels = get().closedPanels.filter((id) => id !== panelId);

        // Check if panel already exists in current layout
        const existingLeaves = getAllLeaves(current);
        if (existingLeaves.includes(panelId)) {
          // Panel already exists, just clear from closed list
          set({ closedPanels });
          return;
        }

        // Add panel to layout - append to the right side
        const newLayout: MosaicNode<PanelId> = current
          ? {
              direction: 'row',
              first: current,
              second: panelId,
              splitPercentage: 75,
            }
          : panelId;

        const validatedLayout = validateAndFixLayout(newLayout);
        set({ currentLayout: validatedLayout, closedPanels });
      },

      clearClosedPanels: () => set({ closedPanels: [] }),

      toggleLock: () => set((s) => ({ isLocked: !s.isLocked })),

      setFullscreen: (panelId) => set({ fullscreenPanel: panelId }),

      savePreset: (name) => {
        const layout = get().currentLayout;
        const newPreset: WorkspacePreset = {
          id: `preset_${Date.now()}`,
          name,
          layout,
        };
        set((s) => ({ presets: [...s.presets, newPreset] }));
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) {
          set({ currentLayout: preset.layout, closedPanels: [], fullscreenPanel: null });
        }
      },

      deletePreset: (id) => {
        // Don't delete default presets
        if (id === 'default' || id === 'minimal' || id === 'creative') return;
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
      },

      reset: () =>
        set({
          currentLayout: defaultPresets[0].layout,
          dockviewLayout: null,
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
          floatingPanels: [],
        }),

      openFloatingPanel: (panelId, x, y, width, height) => {
        const existing = get().floatingPanels.find(p => p.id === panelId);
        if (existing) {
          // Panel already floating, bring to front
          const maxZ = Math.max(...get().floatingPanels.map(p => p.zIndex), 0);
          set({
            floatingPanels: get().floatingPanels.map(p =>
              p.id === panelId ? { ...p, zIndex: maxZ + 1 } : p
            ),
          });
          return;
        }

        // Use provided position/size or calculate defaults
        const finalWidth = width ?? 600;
        const finalHeight = height ?? 400;
        const finalX = x ?? Math.max(0, (window.innerWidth - finalWidth) / 2);
        const finalY = y ?? Math.max(0, (window.innerHeight - finalHeight) / 2);
        const maxZ = Math.max(...get().floatingPanels.map(p => p.zIndex), 0);

        set({
          floatingPanels: [
            ...get().floatingPanels,
            { id: panelId, x: finalX, y: finalY, width: finalWidth, height: finalHeight, zIndex: maxZ + 1 },
          ],
        });
      },

      closeFloatingPanel: (panelId) => {
        set({
          floatingPanels: get().floatingPanels.filter(p => p.id !== panelId),
        });
      },

      minimizeFloatingPanel: (panelId) => {
        // Remove from floating panels (it will become a cube)
        set({
          floatingPanels: get().floatingPanels.filter(p => p.id !== panelId),
        });
      },

      restoreFloatingPanel: (panelState) => {
        // Restore a panel from minimized cube state
        set({
          floatingPanels: [...get().floatingPanels, panelState],
        });
      },

      updateFloatingPanelPosition: (panelId, x, y) => {
        set({
          floatingPanels: get().floatingPanels.map(p =>
            p.id === panelId ? { ...p, x, y } : p
          ),
        });
      },

      updateFloatingPanelSize: (panelId, width, height) => {
        set({
          floatingPanels: get().floatingPanels.map(p =>
            p.id === panelId ? { ...p, width, height } : p
          ),
        });
      },

      bringFloatingPanelToFront: (panelId) => {
        const maxZ = Math.max(...get().floatingPanels.map(p => p.zIndex), 0);
        set({
          floatingPanels: get().floatingPanels.map(p =>
            p.id === panelId ? { ...p, zIndex: maxZ + 1 } : p
          ),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createBackendStorage('workspace'),
      version: 1,
      onRehydrateStorage: () => (state) => {
        // Validate and fix the layout after loading from storage
        if (state?.currentLayout) {
          state.currentLayout = validateAndFixLayout(state.currentLayout);
        }
        // Validate all preset layouts
        if (state?.presets) {
          state.presets = state.presets.map((preset) => ({
            ...preset,
            layout: validateAndFixLayout(preset.layout),
          }));
        }
      },
    }
  )
);
