import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MosaicNode } from 'react-mosaic-component';

export type PanelId = 'gallery' | 'scene' | 'graph' | 'inspector' | 'health' | 'game';

export interface WorkspacePreset {
  id: string;
  name: string;
  layout: MosaicNode<PanelId> | null;
}

export interface WorkspaceState {
  currentLayout: MosaicNode<PanelId> | null;
  closedPanels: PanelId[];
  isLocked: boolean;
  presets: WorkspacePreset[];
  fullscreenPanel: PanelId | null;
}

export interface WorkspaceActions {
  setLayout: (layout: MosaicNode<PanelId> | null) => void;
  closePanel: (panelId: PanelId) => void;
  restorePanel: (panelId: PanelId) => void;
  clearClosedPanels: () => void;
  toggleLock: () => void;
  setFullscreen: (panelId: PanelId | null) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  reset: () => void;
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

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      currentLayout: defaultPresets[0].layout,
      closedPanels: [],
      isLocked: false,
      presets: defaultPresets,
      fullscreenPanel: null,

      setLayout: (layout) => {
        if (get().isLocked) return;
        set({ currentLayout: layout });
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
        const getAllLeaves = (node: MosaicNode<PanelId> | null): PanelId[] => {
          if (!node) return [];
          if (typeof node === 'string') return [node];
          return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
        };

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

        set({ currentLayout: newLayout, closedPanels });
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
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
    }
  )
);
