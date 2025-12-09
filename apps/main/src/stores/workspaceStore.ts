import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBackendStorage } from '../lib/backendStorage';
import { pluginCatalog } from '../lib/plugins/pluginSystem';

export type PanelId =
  | 'gallery'
  | 'scene'
  | 'graph'
  | 'inspector'
  | 'health'
  | 'game'
  | 'providers'
  | 'settings'
  | 'gizmo-lab'
  | 'npc-brain-lab'
  | 'game-theming'
  | 'scene-management'
  | 'dev-tools'
  | 'hud-designer'
  | 'world-visual-roles'
  | 'generations'
  | 'game-tools'
  | 'surface-workbench'
  | 'world-context'
  | 'edge-effects'
  | 'console';

// Tree-based layout structure (replaces MosaicNode)
export type LayoutNode<T> = T | LayoutBranch<T>;

export interface LayoutBranch<T> {
  direction: 'row' | 'column';
  first: LayoutNode<T>;
  second: LayoutNode<T>;
  splitPercentage?: number;
}

export interface FloatingPanelState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  context?: Record<string, any>; // Optional context data to pass to the panel component
}

export interface WorkspacePreset {
  id: string;
  name: string;
  layout: LayoutNode<PanelId> | null;
  description?: string; // Optional description
  icon?: string; // Optional icon/emoji
  visiblePanels?: PanelId[]; // Panels visible in this preset (if not specified, all are visible)
  createdAt?: number; // Timestamp
  isDefault?: boolean; // Whether this is a default preset (cannot be deleted)
  // Optional: preferred graph editor surface for this profile (e.g., 'scene-graph-v2', 'arc-graph')
  graphEditorId?: string;
}

export interface WorkspaceState {
  currentLayout: LayoutNode<PanelId> | null; // Tree-based layout structure
  dockviewLayout: any | null; // Dockview serialized layout
  closedPanels: PanelId[];
  isLocked: boolean;
  presets: WorkspacePreset[];
  fullscreenPanel: PanelId | null;
  floatingPanels: FloatingPanelState[];
  // ID of the currently active workspace preset/profile (if any)
  activePresetId: string | null;
}

export interface WorkspaceActions {
  setLayout: (layout: LayoutNode<PanelId> | null) => void;
  setDockviewLayout: (layout: any) => void;
  closePanel: (panelId: PanelId) => void;
  restorePanel: (panelId: PanelId) => void;
  clearClosedPanels: () => void;
  toggleLock: () => void;
  setFullscreen: (panelId: PanelId | null) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  // Update preset-specific metadata (currently used for graph editor selection)
  setPresetGraphEditor: (presetId: string, graphEditorId: string) => void;
  reset: () => void;
  openFloatingPanel: (panelId: PanelId, options?: { x?: number; y?: number; width?: number; height?: number; context?: Record<string, any> }) => void;
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
    description: 'Balanced layout for general development',
    icon: '🏠',
    isDefault: true,
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
    description: 'Focus on graph editing and game preview',
    icon: '⚡',
    isDefault: true,
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
    description: 'Optimized for content creation',
    icon: '🎨',
    isDefault: true,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Editor Workspace Presets
  // These presets center the core editors (Game View, Flow View, World Editor)
  // and group satellite panels around them.
  // ─────────────────────────────────────────────────────────────────────────────

  {
    id: 'world-locations',
    name: 'World & Locations',
    description: 'World editor-centric layout for managing locations, visual roles, and world theming',
    icon: '🌍',
    isDefault: true,
    // Primary view: 'world', Mode: 'layout'
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'gallery',
        second: 'world-visual-roles',
        splitPercentage: 50,
      },
      second: {
        direction: 'column',
        first: 'game-theming',
        second: 'game',
        splitPercentage: 50,
      },
      splitPercentage: 40,
    },
  },
  {
    id: 'narrative-flow',
    name: 'Narrative & Flow',
    description: 'Flow View-centric layout for designing scenes, nodes, choices, and transitions',
    icon: '🔀',
    isDefault: true,
    graphEditorId: 'scene-graph-v2',
    // Primary view: 'flow', Mode: 'edit-flow'
    layout: {
      direction: 'row',
      first: 'graph',
      second: {
        direction: 'column',
        first: {
          direction: 'row',
          first: 'scene',
          second: 'inspector',
          splitPercentage: 50,
        },
        second: {
          direction: 'row',
          first: 'scene-management',
          second: 'health',
          splitPercentage: 50,
        },
        splitPercentage: 60,
      },
      splitPercentage: 55,
    },
  },
  {
    id: 'playtest-tuning',
    name: 'Playtest & Tuning',
    description: 'Game View-centric layout for playtesting, runtime tools, and HUD design',
    icon: '🎮',
    isDefault: true,
    // Primary view: 'game', Mode: 'play' or 'debug'
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'game-tools',
        second: 'hud-designer',
        splitPercentage: 50,
      },
      second: {
        direction: 'column',
        first: 'game',
        second: 'dev-tools',
        splitPercentage: 70,
      },
      splitPercentage: 30,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Developer Presets
  // ─────────────────────────────────────────────────────────────────────────────

  {
    id: 'dev-default',
    name: 'Dev – Default Debug',
    description: 'Graph, session state, dev tools, and health monitoring',
    icon: '🧪',
    isDefault: true,
    layout: {
      direction: 'row',
      first: 'graph',
      second: {
        direction: 'column',
        first: 'dev-tools',
        second: 'health',
        splitPercentage: 60,
      },
      splitPercentage: 60,
    },
    graphEditorId: 'scene-graph-v2',
  },
  {
    id: 'dev-plugins',
    name: 'Dev – Plugin Workshop',
    description: 'Focus on plugin development and testing',
    icon: '🔌',
    isDefault: true,
    layout: {
      direction: 'row',
      first: {
        direction: 'column',
        first: 'dev-tools',
        second: 'settings',
        splitPercentage: 70,
      },
      second: 'game',
      splitPercentage: 40,
    },
  },
  {
    id: 'dev-architecture',
    name: 'Dev – Architecture View',
    description: 'Graph editor with architecture and dependency visualization',
    icon: '🏗️',
    isDefault: true,
    layout: {
      direction: 'row',
      first: 'graph',
      second: 'dev-tools',
      splitPercentage: 50,
    },
    graphEditorId: 'scene-graph-v2',
  },
];

const STORAGE_KEY = 'workspace_v2';

// Helper to get all leaf IDs from a layout tree
const getAllLeaves = (node: LayoutNode<PanelId> | null): PanelId[] => {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
};

// Helper to validate and fix duplicate IDs in a layout
const validateAndFixLayout = (layout: LayoutNode<PanelId> | null): LayoutNode<PanelId> | null => {
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
      activePresetId: defaultPresets[0].id,

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
        // Check if panel is disabled via plugin system
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === 'inactive') {
          console.warn(`Cannot restore panel "${panelId}": Panel is disabled. Enable it in the Plugin Browser first.`);
          // TODO: Show user-facing notification
          return;
        }

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
        const newLayout: LayoutNode<PanelId> = current
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
          createdAt: Date.now(),
          isDefault: false,
        };
        set((s) => ({ presets: [...s.presets, newPreset], activePresetId: newPreset.id }));
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset) {
          set({
            currentLayout: preset.layout,
            closedPanels: [],
            fullscreenPanel: null,
            activePresetId: id,
          });
        }
      },

      deletePreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        // Don't delete default presets
        if (preset?.isDefault) return;
        set((s) => {
          const remaining = s.presets.filter((p) => p.id !== id);
          const newActiveId =
            s.activePresetId === id ? (remaining.find((p) => p.isDefault)?.id ?? null) : s.activePresetId;
          return { presets: remaining, activePresetId: newActiveId };
        });
      },

      setPresetGraphEditor: (presetId, graphEditorId) => {
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === presetId ? { ...p, graphEditorId } : p
          ),
        }));
      },

      reset: () =>
        set({
          currentLayout: defaultPresets[0].layout,
          dockviewLayout: null,
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
          floatingPanels: [],
          activePresetId: defaultPresets[0].id,
        }),

      openFloatingPanel: (panelId, options = {}) => {
        // Check if panel is disabled via plugin system
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === 'inactive') {
          console.warn(`Cannot open panel "${panelId}": Panel is disabled. Enable it in the Plugin Browser first.`);
          // TODO: Show user-facing notification
          return;
        }

        const { x, y, width, height, context } = options;
        const existing = get().floatingPanels.find(p => p.id === panelId);
        if (existing) {
          // Panel already floating, update context and bring to front
          const maxZ = Math.max(...get().floatingPanels.map(p => p.zIndex), 0);
          set({
            floatingPanels: get().floatingPanels.map(p =>
              p.id === panelId ? { ...p, zIndex: maxZ + 1, context: context ?? p.context } : p
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
            { id: panelId, x: finalX, y: finalY, width: finalWidth, height: finalHeight, zIndex: maxZ + 1, context },
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
