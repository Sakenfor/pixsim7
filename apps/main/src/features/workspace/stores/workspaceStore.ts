import type { DockviewApi } from "dockview-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { addDockviewPanel, focusPanel } from "@lib/dockview";


import { createBackendStorage } from "../../../lib/backendStorage";
import { pluginCatalog } from "../../../lib/plugins/pluginSystem";
import { resolveWorkspaceDockview } from "../lib/resolveWorkspaceDockview";

export type PanelId =
  | "assetViewer"
  | "controlCenter"
  | "gallery"
  | "scene"
  | "graph"
  | "inspector"
  | "health"
  | "game"
  | "providers"
  | "settings"
  | "gizmo-lab"
  | "npc-brain-lab"
  | "game-theming"
  | "scene-management"
  | "dev-tools"
  | "hud-designer"
  | "world-visual-roles"
  | "generations"
  | "game-tools"
  | "surface-workbench"
  | "world-context"
  | "edge-effects"
  | "console"
  | "model-inspector"
  | "quickgen-asset"
  | "quickgen-history"
  | "quickgen-prompt"
  | "quickgen-settings"
  | "quickgen-blocks"
  | "media-preview";

/**
 * Preset scope determines which dockviews a preset applies to
 */
export type PresetScope = "workspace" | "control-center" | "asset-viewer" | "all";

/** Dockview serialized layout type */
export type DockviewLayout = ReturnType<DockviewApi["toJSON"]>;

/**
 * Floating panel state for panels opened outside the main dockview
 */
export interface FloatingPanelState {
  id: PanelId | `dev-tool:${string}`;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  context?: Record<string, any>;
}

/**
 * Layout preset using dockview's native serialization format
 */
export interface LayoutPreset {
  id: string;
  name: string;
  /** Scope determines which dockviews this preset applies to */
  scope: PresetScope;
  /** Dockview serialized layout (from api.toJSON()) - null means use default */
  layout: DockviewLayout | null;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  createdAt?: number;
  /** Preferred graph editor for this preset */
  graphEditorId?: string;
}

export interface WorkspaceState {
  /** Closed panels (can be restored) */
  closedPanels: PanelId[];
  /** Lock prevents layout changes */
  isLocked: boolean;
  /** All saved presets (scoped) - presets are just named layout snapshots */
  presets: LayoutPreset[];
  /** Panel in fullscreen mode */
  fullscreenPanel: PanelId | null;
  /** Floating panels outside main dockview */
  floatingPanels: FloatingPanelState[];
  /** Currently active preset ID per scope */
  activePresetByScope: Partial<Record<PresetScope, string | null>>;
}

export interface WorkspaceActions {
  /** Close a panel */
  closePanel: (panelId: PanelId) => void;
  /** Restore a closed panel */
  restorePanel: (panelId: PanelId) => void;
  /** Clear all closed panels */
  clearClosedPanels: () => void;
  /** Toggle layout lock */
  toggleLock: () => void;
  /** Set fullscreen panel */
  setFullscreen: (panelId: PanelId | null) => void;
  /** Save current layout as a new preset (layout from api.toJSON()) */
  savePreset: (name: string, scope: PresetScope, layout: DockviewLayout) => void;
  /** Update an existing preset's layout */
  updatePreset: (id: string, layout: DockviewLayout) => void;
  /** Get a preset's layout (caller applies via api.fromJSON()) */
  getPresetLayout: (id: string) => DockviewLayout | null;
  /** Delete a preset */
  deletePreset: (id: string) => void;
  /** Get presets for a specific scope */
  getPresetsForScope: (scope: PresetScope) => LayoutPreset[];
  /** Get active preset ID for a scope */
  getActivePresetId: (scope: PresetScope) => string | null;
  /** Update preset metadata */
  setPresetGraphEditor: (presetId: string, graphEditorId: string) => void;
  /** Set active preset ID for a scope (UI state only, layout handled by SmartDockview) */
  setActivePreset: (scope: PresetScope, presetId: string | null) => void;
  /** Reset all state */
  reset: () => void;
  // Floating panel actions
  openFloatingPanel: (
    panelId: PanelId | `dev-tool:${string}`,
    options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      context?: Record<string, any>;
    },
  ) => void;
  closeFloatingPanel: (panelId: PanelId | `dev-tool:${string}`) => void;
  minimizeFloatingPanel: (panelId: PanelId | `dev-tool:${string}`) => void;
  restoreFloatingPanel: (panelState: FloatingPanelState) => void;
  updateFloatingPanelPosition: (
    panelId: PanelId | `dev-tool:${string}`,
    x: number,
    y: number,
  ) => void;
  updateFloatingPanelSize: (
    panelId: PanelId | `dev-tool:${string}`,
    width: number,
    height: number,
  ) => void;
  bringFloatingPanelToFront: (panelId: PanelId | `dev-tool:${string}`) => void;
  updateFloatingPanelContext: (
    panelId: PanelId | `dev-tool:${string}`,
    context: Record<string, any>,
  ) => void;
  getFloatingPanel: (panelId: PanelId | `dev-tool:${string}`) => FloatingPanelState | undefined;
}

/**
 * Default presets - layout is null meaning "use dockview's default initialization"
 */
const defaultPresets: LayoutPreset[] = [
  {
    id: "default",
    name: "Default Workspace",
    scope: "workspace",
    description: "Balanced layout for general development",
    icon: "🏠",
    isDefault: true,
    layout: null,
  },
  {
    id: "minimal",
    name: "Minimal",
    scope: "workspace",
    description: "Focus on graph editing and game preview",
    icon: "⚡",
    isDefault: true,
    layout: null,
  },
  {
    id: "creative",
    name: "Creative Studio",
    scope: "workspace",
    description: "Optimized for content creation",
    icon: "🎨",
    isDefault: true,
    layout: null,
  },
  {
    id: "narrative-flow",
    name: "Narrative & Flow",
    scope: "workspace",
    description: "Flow View-centric layout for designing scenes",
    icon: "🔀",
    isDefault: true,
    layout: null,
    graphEditorId: "scene-graph-v2",
  },
  {
    id: "playtest-tuning",
    name: "Playtest & Tuning",
    scope: "workspace",
    description: "Game View-centric layout for playtesting",
    icon: "🎮",
    isDefault: true,
    layout: null,
  },
  {
    id: "dev-default",
    name: "Dev – Debug",
    scope: "workspace",
    description: "Graph, dev tools, and health monitoring",
    icon: "🧪",
    isDefault: true,
    layout: null,
    graphEditorId: "scene-graph-v2",
  },

  {
    id: "control-center-default",
    name: "Default Control Center",
    scope: "control-center",
    description: "Default control center layout",
    icon: "layout",
    isDefault: true,
    layout: null,
  },
  {
    id: "asset-viewer-default",
    name: "Default Asset Viewer",
    scope: "asset-viewer",
    description: "Default asset viewer layout",
    icon: "layout",
    isDefault: true,
    layout: null,
  },

];

const STORAGE_KEY = "workspace_v5"; // v5: removed layoutByScope (layouts now in localStorage via SmartDockview)

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      closedPanels: [],
      isLocked: false,
      presets: defaultPresets,
      fullscreenPanel: null,
      floatingPanels: [],
      activePresetByScope: {
        workspace: "default",
        "control-center": "control-center-default",
        "asset-viewer": "asset-viewer-default",
      },

      closePanel: (panelId) => {
        const closedPanels = get().closedPanels;
        if (!closedPanels.includes(panelId)) {
          set({ closedPanels: [...closedPanels, panelId] });
        }
      },

      restorePanel: (panelId) => {
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === "inactive") {
          return;
        }

        // Remove from closed panels
        const closedPanels = get().closedPanels.filter((id) => id !== panelId);
        set({ closedPanels });

        const api = resolveWorkspaceDockview().api;
        if (!api) {
          console.warn(`[restorePanel] Workspace dockview not available`);
          return;
        }

        // Check if panel already exists
        if (focusPanel(api, panelId)) {
          return;
        }

        addDockviewPanel(api, panelId, {
          allowMultiple: false,
          position: { direction: "right" },
        });
      },

      clearClosedPanels: () => set({ closedPanels: [] }),

      toggleLock: () => set((s) => ({ isLocked: !s.isLocked })),

      setFullscreen: (panelId) => set({ fullscreenPanel: panelId }),

      savePreset: (name, scope, layout) => {
        const newPreset: LayoutPreset = {
          id: `preset_${Date.now()}`,
          name,
          scope,
          layout,
          createdAt: Date.now(),
          isDefault: false,
        };
        set((s) => ({
          presets: [...s.presets, newPreset],
          activePresetByScope: {
            ...s.activePresetByScope,
            [scope]: newPreset.id,
          },
        }));
      },

      updatePreset: (id, layout) => {
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id ? { ...p, layout } : p,
          ),
        }));
      },

      getPresetLayout: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        return preset?.layout ?? null;
      },

      deletePreset: (id) => {
        const preset = get().presets.find((p) => p.id === id);
        if (preset?.isDefault) return;
        set((s) => {
          const remaining = s.presets.filter((p) => p.id !== id);
          const newActiveByScope = { ...s.activePresetByScope };

          // If deleted preset was active, reset to default for that scope
          if (preset && newActiveByScope[preset.scope] === id) {
            const defaultForScope = remaining.find(
              (p) => p.isDefault && p.scope === preset.scope
            );
            newActiveByScope[preset.scope] = defaultForScope?.id ?? null;
          }

          return { presets: remaining, activePresetByScope: newActiveByScope };
        });
      },

      getPresetsForScope: (scope) => {
        return get().presets.filter(
          (p) => p.scope === scope || p.scope === "all"
        );
      },

      getActivePresetId: (scope) => {
        return get().activePresetByScope[scope] ?? null;
      },

      setPresetGraphEditor: (presetId, graphEditorId) => {
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === presetId ? { ...p, graphEditorId } : p,
          ),
        }));
      },

      setActivePreset: (scope, presetId) => {
        set((s) => ({
          activePresetByScope: {
            ...s.activePresetByScope,
            [scope]: presetId,
          },
        }));
      },

      reset: () =>
        set({
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
          floatingPanels: [],
          activePresetByScope: {
        workspace: "default",
        "control-center": "control-center-default",
        "asset-viewer": "asset-viewer-default",
      },
        }),

      openFloatingPanel: (panelId, options = {}) => {
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === "inactive") {
          return;
        }

        const { x, y, width, height, context } = options;
        const existing = get().floatingPanels.find((p) => p.id === panelId);
        if (existing) {
          const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);
          set({
            floatingPanels: get().floatingPanels.map((p) =>
              p.id === panelId
                ? { ...p, zIndex: maxZ + 1, context: context ?? p.context }
                : p,
            ),
          });
          return;
        }

        const finalWidth = width ?? 600;
        const finalHeight = height ?? 400;
        const finalX = x ?? Math.max(0, (window.innerWidth - finalWidth) / 2);
        const finalY = y ?? Math.max(0, (window.innerHeight - finalHeight) / 2);
        const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);

        set({
          floatingPanels: [
            ...get().floatingPanels,
            {
              id: panelId,
              x: finalX,
              y: finalY,
              width: finalWidth,
              height: finalHeight,
              zIndex: maxZ + 1,
              context,
            },
          ],
        });
      },

      closeFloatingPanel: (panelId) => {
        set({
          floatingPanels: get().floatingPanels.filter((p) => p.id !== panelId),
        });
      },

      minimizeFloatingPanel: (panelId) => {
        set({
          floatingPanels: get().floatingPanels.filter((p) => p.id !== panelId),
        });
      },

      restoreFloatingPanel: (panelState) => {
        set({
          floatingPanels: [...get().floatingPanels, panelState],
        });
      },

      updateFloatingPanelPosition: (panelId, x, y) => {
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, x, y } : p,
          ),
        });
      },

      updateFloatingPanelSize: (panelId, width, height) => {
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, width, height } : p,
          ),
        });
      },

      bringFloatingPanelToFront: (panelId) => {
        const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, zIndex: maxZ + 1 } : p,
          ),
        });
      },

      updateFloatingPanelContext: (panelId, context) => {
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, context: { ...p.context, ...context } } : p,
          ),
        });
      },

      getFloatingPanel: (panelId) => {
        return get().floatingPanels.find((p) => p.id === panelId);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage("workspace")),
      version: 5, // Bumped: removed layoutByScope (now in localStorage via SmartDockview)
      partialize: (state) => ({
        closedPanels: state.closedPanels,
        isLocked: state.isLocked,
        presets: state.presets,
        fullscreenPanel: state.fullscreenPanel,
        floatingPanels: state.floatingPanels,
        activePresetByScope: state.activePresetByScope,
      }) as Partial<WorkspaceState & WorkspaceActions>,
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.floatingPanels)) {
          state.floatingPanels = [];
        }
      },
    },
  ),
);

// Legacy exports for backwards compatibility
/** @deprecated Use LayoutPreset instead */
export type WorkspacePreset = LayoutPreset;
