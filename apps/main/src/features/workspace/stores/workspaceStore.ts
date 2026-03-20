import type { DockviewApi } from "dockview-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { addDockviewPanel, focusPanel, getDockviewApi, getDockviewGroups } from "@lib/dockview";
import { readFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";
import { dockWidgetSelectors, panelSelectors } from "@lib/plugins/catalogSelectors";
import { hmrSingleton } from "@lib/utils/hmrSafe";

import { createBackendStorage } from "../../../lib/backendStorage";
import { pluginCatalog } from "../../../lib/plugins/pluginSystem";
import { getBuiltinLayoutPresetsForScope, isBuiltinPreset, BUILTIN_PRESET_IDS } from "../lib/builtinPresets";
import { getFloatingDefinitionId, createFloatingInstanceId } from "../lib/floatingPanelUtils";
import { resolveWorkspaceDockview } from "../lib/resolveWorkspaceDockview";

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
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized?: boolean;
  /** Width before minimize — restored when un-minimizing */
  preMinimizedWidth?: number;
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
  closedPanels: string[];
  /** Lock prevents layout changes */
  isLocked: boolean;
  /** All saved presets (scoped) - presets are just named layout snapshots */
  presets: LayoutPreset[];
  /** Panel in fullscreen mode */
  fullscreenPanel: string | null;
  /** Floating panels outside main dockview */
  floatingPanels: FloatingPanelState[];
  /** Currently active preset ID per scope */
  activePresetByScope: Partial<Record<PresetScope, string | null>>;
  /** User-pinned panels shown as quick-add shortcuts in context menu */
  pinnedQuickAddPanels: string[];
  /** Remembered geometry for floating panels (persists across close/reopen) */
  lastFloatingPanelStates: Record<string, { x: number; y: number; width: number; height: number }>;
  /** Currently focused floating panel (others fade when set) */
  focusedFloatingPanelId: string | null;
}

export interface WorkspaceActions {
  /** Close a panel */
  closePanel: (panelId: string) => void;
  /** Restore a closed panel */
  restorePanel: (panelId: string) => void;
  /** Clear all closed panels */
  clearClosedPanels: () => void;
  /** Toggle layout lock */
  toggleLock: () => void;
  /** Set fullscreen panel */
  setFullscreen: (panelId: string | null) => void;
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
  /** Toggle a panel's pinned state for quick-add shortcuts */
  toggleQuickAddPin: (panelId: string) => void;
  /** Check if a panel is pinned for quick-add */
  isPinnedQuickAdd: (panelId: string) => boolean;
  /** Reset all state */
  reset: () => void;
  // Floating panel actions
  openFloatingPanel: (
    panelId: string,
    options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      context?: Record<string, any>;
    },
  ) => void;
  closeFloatingPanel: (panelId: string) => void;
  minimizeFloatingPanel: (panelId: string) => void;
  restoreFloatingPanel: (panelState: FloatingPanelState) => void;
  updateFloatingPanelPosition: (
    panelId: string,
    x: number,
    y: number,
  ) => void;
  updateFloatingPanelSize: (
    panelId: string,
    width: number,
    height: number,
  ) => void;
  bringFloatingPanelToFront: (panelId: string) => void;
  /** Clear floating panel focus (all panels return to full opacity) */
  blurFloatingPanels: () => void;
  updateFloatingPanelContext: (
    panelId: string,
    context: Record<string, any>,
  ) => void;
  getFloatingPanel: (panelId: string) => FloatingPanelState | undefined;
  dockFloatingPanel: (
    panelId: string,
    position: {
      direction: "left" | "right" | "above" | "below" | "within";
      referencePanel?: string;
      targetDockviewId?: string;
    }
  ) => void;
}

const STORAGE_KEY = "workspace_v9"; // v9: remove gallery from pinned (duplicate of page nav)

function getDockviewGroupPanelCount(group: any): number {
  if (!group) return 0;
  const panels = group.panels;
  if (Array.isArray(panels)) return panels.length;
  if (panels && typeof panels.length === "number") return panels.length;
  const model = group.model;
  if (typeof model?.size === "number") return model.size;
  return 0;
}

function pruneNewEmptyGroups(api: DockviewApi, baselineGroupIds: Set<string>): void {
  const removeGroup = (api as any).removeGroup;
  if (typeof removeGroup !== "function") return;

  const groups = getDockviewGroups(api);
  for (const group of groups) {
    const groupId = typeof (group as any)?.id === "string" ? (group as any).id : null;
    if (!groupId || baselineGroupIds.has(groupId)) continue;
    if (getDockviewGroupPanelCount(group) > 0) continue;
    if (getDockviewGroups(api).length <= 1) break;
    try {
      removeGroup.call(api, group);
    } catch {
      // best effort cleanup
    }
  }
}

function normalizeDockviewId(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function getScopedDockPanelIds(dockviewId: string): string[] {
  const normalizedDockviewId = normalizeDockviewId(dockviewId);
  const zone = dockWidgetSelectors.getAll().find((item) => {
    return (
      normalizeDockviewId(item.dockviewId) === normalizedDockviewId ||
      normalizeDockviewId(item.id) === normalizedDockviewId
    );
  });
  if (!zone) return [];
  if (Array.isArray(zone.allowedPanels) && zone.allowedPanels.length > 0) {
    return zone.allowedPanels;
  }
  if (typeof zone.panelScope === "string" && zone.panelScope.length > 0) {
    return panelSelectors.getIdsForScope(zone.panelScope);
  }
  return [];
}

function sanitizeDockPosition(
  position: {
    direction: "left" | "right" | "above" | "below" | "within";
    referencePanel?: string;
  }
): {
  direction: "left" | "right" | "above" | "below" | "within";
  referencePanel?: string;
} {
  return position.referencePanel
    ? { direction: position.direction, referencePanel: position.referencePanel }
    : { direction: position.direction };
}

const createWorkspaceStore = () => create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      closedPanels: [],
      isLocked: false,
      presets: [],
      fullscreenPanel: null,
      floatingPanels: [],
      pinnedQuickAddPanels: ['inspector'],
      lastFloatingPanelStates: {},
      focusedFloatingPanelId: null,
      activePresetByScope: {
        workspace: "default",
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
          if (import.meta.env.DEV) {
            console.warn("[workspaceStore] restorePanel blocked by inactive plugin", {
              panelId,
              activationState: pluginMeta.activationState,
            });
          }
          return;
        }

        // Remove from closed panels
        const closedPanels = get().closedPanels.filter((id) => id !== panelId);
        set({ closedPanels });

        const api = resolveWorkspaceDockview().api;
        if (!api) {
          // Dockview not mounted (e.g. not on workspace route) — open floating instead
          get().openFloatingPanel(panelId);
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
        if (isBuiltinPreset(id)) return;
        const preset = get().presets.find((p) => p.id === id);
        if (!preset) return;
        set((s) => {
          const remaining = s.presets.filter((p) => p.id !== id);
          const newActiveByScope = { ...s.activePresetByScope };

          // If deleted preset was active, reset to default for that scope
          if (newActiveByScope[preset.scope] === id) {
            newActiveByScope[preset.scope] = "default";
          }

          return { presets: remaining, activePresetByScope: newActiveByScope };
        });
      },

      getPresetsForScope: (scope) => {
        const builtins = getBuiltinLayoutPresetsForScope(scope);
        const userPresets = get().presets.filter(
          (p) => p.scope === scope || p.scope === "all"
        );
        return [...builtins, ...userPresets];
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

      toggleQuickAddPin: (panelId) => {
        const current = get().pinnedQuickAddPanels;
        if (current.includes(panelId)) {
          set({ pinnedQuickAddPanels: current.filter((id) => id !== panelId) });
        } else {
          set({ pinnedQuickAddPanels: [...current, panelId] });
        }
      },

      isPinnedQuickAdd: (panelId) => {
        return get().pinnedQuickAddPanels.includes(panelId);
      },

      reset: () =>
        set({
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
          floatingPanels: [],
          pinnedQuickAddPanels: ['inspector'],
          lastFloatingPanelStates: {},
          focusedFloatingPanelId: null,
          activePresetByScope: {
            workspace: "default",
          },
        }),

      openFloatingPanel: (panelId, options = {}) => {
        const pluginMeta = pluginCatalog.get(panelId);
        if (pluginMeta && pluginMeta.activationState === "inactive") {
          if (import.meta.env.DEV) {
            console.warn("[workspaceStore] openFloatingPanel blocked by inactive plugin", {
              panelId,
              activationState: pluginMeta.activationState,
            });
          }
          return;
        }

        const { x, y, width, height, context } = options;
        const panelDef = panelSelectors.get(panelId);
        if (import.meta.env.DEV && !panelDef && !panelId.startsWith("dev-tool:")) {
          console.warn("[workspaceStore] opening floating panel without registered definition", {
            panelId,
          });
        }
        const isMultiInstance = panelDef?.supportsMultipleInstances === true;

        if (isMultiInstance) {
          // Multi-instance: enforce maxInstances, generate unique floating ID
          const floatingPanels = get().floatingPanels;
          const defId = panelId;
          const instancesOfDef = floatingPanels.filter(
            (p) => getFloatingDefinitionId(p.id) === defId,
          );
          if (panelDef?.maxInstances != null && instancesOfDef.length >= panelDef.maxInstances) {
            // At capacity — bring first instance to front
            const first = instancesOfDef[0];
            if (first) get().bringFloatingPanelToFront(first.id);
            return;
          }
          const floatingId = createFloatingInstanceId(panelId, floatingPanels);

          const saved = get().lastFloatingPanelStates[panelId];
          const finalWidth = width ?? saved?.width ?? 600;
          const finalHeight = height ?? saved?.height ?? 400;
          const rawX = x ?? saved?.x ?? (window.innerWidth - finalWidth) / 2;
          const rawY = y ?? saved?.y ?? (window.innerHeight - finalHeight) / 2;
          const finalX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(finalWidth, 100)));
          const finalY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(finalHeight, 40)));
          const maxZ = Math.max(...floatingPanels.map((p) => p.zIndex), 0);

          set({
            floatingPanels: [
              ...floatingPanels,
              {
                id: floatingId,
                x: finalX,
                y: finalY,
                width: finalWidth,
                height: finalHeight,
                zIndex: maxZ + 1,
                context,
              },
            ],
          });
          return;
        }

        // Single-instance: existing behavior (focus if already open)
        const existing = get().floatingPanels.find((p) => p.id === panelId);
        if (existing) {
          const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);
          const nextWidth = width ?? existing.width;
          const nextHeight = height ?? existing.height;
          const rawX = x ?? existing.x;
          const rawY = y ?? existing.y;
          const nextX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(nextWidth, 100)));
          const nextY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(nextHeight, 40)));
          const nextContext =
            context != null
              ? { ...(existing.context ?? {}), ...context }
              : existing.context;
          set({
            floatingPanels: get().floatingPanels.map((p) =>
              p.id === panelId
                ? {
                    ...p,
                    x: nextX,
                    y: nextY,
                    width: nextWidth,
                    height: nextHeight,
                    minimized: false,
                    zIndex: maxZ + 1,
                    context: nextContext,
                  }
                : p,
            ),
          });
          return;
        }

        const saved = get().lastFloatingPanelStates[panelId];
        const finalWidth = width ?? saved?.width ?? 600;
        const finalHeight = height ?? saved?.height ?? 400;
        const rawX = x ?? saved?.x ?? (window.innerWidth - finalWidth) / 2;
        const rawY = y ?? saved?.y ?? (window.innerHeight - finalHeight) / 2;
        // Clamp to viewport so panels don't appear off-screen
        const finalX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(finalWidth, 100)));
        const finalY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(finalHeight, 40)));
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
        const panel = get().floatingPanels.find((p) => p.id === panelId);
        const defId = getFloatingDefinitionId(panelId);
        const saved = panel
          ? { ...get().lastFloatingPanelStates, [defId]: { x: panel.x, y: panel.y, width: panel.preMinimizedWidth ?? panel.width, height: panel.height } }
          : get().lastFloatingPanelStates;
        set({
          floatingPanels: get().floatingPanels.filter((p) => p.id !== panelId),
          lastFloatingPanelStates: saved,
          focusedFloatingPanelId: get().focusedFloatingPanelId === panelId ? null : get().focusedFloatingPanelId,
        });
      },

      minimizeFloatingPanel: (panelId) => {
        const MINIMIZED_WIDTH = 280;
        set({
          floatingPanels: get().floatingPanels.map((p) => {
            if (p.id !== panelId) return p;
            if (p.minimized) {
              // Restore: bring back pre-minimize width
              return { ...p, minimized: false, width: p.preMinimizedWidth ?? p.width, preMinimizedWidth: undefined };
            }
            // Minimize: save current width, shrink
            return { ...p, minimized: true, preMinimizedWidth: p.width, width: Math.min(p.width, MINIMIZED_WIDTH) };
          }),
        });
      },

      restoreFloatingPanel: (panelState) => {
        // Dedup: skip if a floating panel with the same definition is already open
        const defId = getFloatingDefinitionId(panelState.id);
        const existing = get().floatingPanels.find(
          (p) => getFloatingDefinitionId(p.id) === defId,
        );
        if (existing) return;
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
          focusedFloatingPanelId: panelId,
        });
      },

      blurFloatingPanels: () => {
        if (get().focusedFloatingPanelId !== null) {
          set({ focusedFloatingPanelId: null });
        }
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

      dockFloatingPanel: (panelId, position) => {
        const floatingPanel = get().floatingPanels.find((p) => p.id === panelId);
        if (!floatingPanel) return;

        // Resolve definition ID (strips ::N suffix for multi-instance panels)
        const defId = getFloatingDefinitionId(panelId);
        const originMeta = readFloatingOriginMeta(floatingPanel.context);

        // Dev-tool panels use dynamic components not registered in dockview —
        // they can only live as floating panels.
        if (defId.startsWith("dev-tool:")) {
          console.warn("[dockFloatingPanel] Dev-tool panels cannot be docked:", defId);
          return;
        }

        // Get target dockview API (defaults to "workspace" for backward compat)
        const requestedDockviewId = position.targetDockviewId ?? "workspace";
        let targetDockviewId = requestedDockviewId;
        let api = getDockviewApi(targetDockviewId);
        if (!api) {
          console.warn("[dockFloatingPanel] Dockview not available:", targetDockviewId);
          return;
        }

        // Resolve the actual panel ID (strip dev-tool: prefix if present)
        const actualPanelId = defId.startsWith("dev-tool:")
          ? defId.slice("dev-tool:".length)
          : defId;
        const isDevToolPanel = defId.startsWith("dev-tool:");

        let dockPosition = sanitizeDockPosition(position);

        // For scoped dockviews, avoid forcing unsupported panel definitions into
        // the outer host. If the panel came from an origin dockview, return it there.
        if (!isDevToolPanel) {
          const scopedPanelIds = getScopedDockPanelIds(targetDockviewId);
          const isSupportedByTargetScope =
            scopedPanelIds.length === 0 || scopedPanelIds.includes(actualPanelId);

          if (!isSupportedByTargetScope) {
            const sourceDockviewId =
              typeof originMeta?.sourceDockviewId === "string" &&
              originMeta.sourceDockviewId.length > 0
                ? originMeta.sourceDockviewId
                : null;
            const sourceApi = sourceDockviewId ? getDockviewApi(sourceDockviewId) : null;
            if (sourceDockviewId && sourceApi) {
              targetDockviewId = sourceDockviewId;
              api = sourceApi;
              dockPosition = { direction: "within" };
            }
          }
        }

        const baselineGroupIds = new Set(
          getDockviewGroups(api)
            .map((group: any) => (typeof group?.id === "string" ? group.id : null))
            .filter((id: string | null): id is string => id !== null),
        );
        const wasAlreadyDocked = !!api.getPanel(actualPanelId);

        // Add panel to dockview at the specified position
        try {
          addDockviewPanel(api, actualPanelId, {
            allowMultiple: false,
            position: dockPosition,
            params: floatingPanel.context,
          });
        } catch (error) {
          pruneNewEmptyGroups(api, baselineGroupIds);
          console.warn("[dockFloatingPanel] Failed to dock panel:", {
            panelId,
            defId,
            requestedDockviewId,
            targetDockviewId,
            error,
          });
          return;
        }

        const isDocked = !!api.getPanel(actualPanelId);
        if (!isDocked && !wasAlreadyDocked) {
          pruneNewEmptyGroups(api, baselineGroupIds);
          console.warn("[dockFloatingPanel] Dock request produced no panel. Keeping floating panel.", {
            panelId,
            defId,
            requestedDockviewId,
            targetDockviewId,
          });
          return;
        }

        // Save geometry and remove floating only after successful docking.
        set({
          floatingPanels: get().floatingPanels.filter((p) => p.id !== panelId),
          lastFloatingPanelStates: {
            ...get().lastFloatingPanelStates,
            [defId]: { x: floatingPanel.x, y: floatingPanel.y, width: floatingPanel.preMinimizedWidth ?? floatingPanel.width, height: floatingPanel.height },
          },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage("workspace")),
      version: 9, // v9: remove gallery from pinned (duplicate of page nav)
      migrate: (persistedState: any, version: number) => {
        if (version < 6) {
          persistedState.pinnedQuickAddPanels = ['inspector'];
        }
        if (version < 7) {
          persistedState.lastFloatingPanelStates = {};
        }
        if (version < 8) {
          // Strip built-in presets from persisted array — they now live in code
          if (Array.isArray(persistedState.presets)) {
            persistedState.presets = persistedState.presets.filter(
              (p: any) => !p.isDefault && !BUILTIN_PRESET_IDS.has(p.id)
            );
          }
        }
        if (version < 9) {
          // Remove 'gallery' from pinned panels — now covered by page nav in ActivityBar
          if (Array.isArray(persistedState.pinnedQuickAddPanels)) {
            persistedState.pinnedQuickAddPanels = persistedState.pinnedQuickAddPanels.filter(
              (id: string) => id !== 'gallery'
            );
          }
        }
        return persistedState;
      },
      partialize: (state) => ({
        closedPanels: state.closedPanels,
        isLocked: state.isLocked,
        presets: state.presets,
        fullscreenPanel: state.fullscreenPanel,
        floatingPanels: state.floatingPanels,
        pinnedQuickAddPanels: state.pinnedQuickAddPanels,
        lastFloatingPanelStates: state.lastFloatingPanelStates,
        activePresetByScope: state.activePresetByScope,
      }) as Partial<WorkspaceState & WorkspaceActions>,
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.floatingPanels)) {
          state.floatingPanels = [];
        }
        if (state && (typeof state.lastFloatingPanelStates !== 'object' || state.lastFloatingPanelStates === null)) {
          state.lastFloatingPanelStates = {};
        }
        // Deduplicate floating panels — keep only the last entry per definition ID.
        if (state && Array.isArray(state.floatingPanels) && state.floatingPanels.length > 1) {
          const seenDefIds = new Set<string>();
          const deduped: typeof state.floatingPanels = [];
          // Iterate in reverse so the latest entry (highest zIndex) wins
          for (let i = state.floatingPanels.length - 1; i >= 0; i--) {
            const defId = getFloatingDefinitionId(state.floatingPanels[i].id);
            if (!seenDefIds.has(defId)) {
              seenDefIds.add(defId);
              deduped.push(state.floatingPanels[i]);
            }
          }
          state.floatingPanels = deduped.reverse();
        }
      },
    },
  ),
);

export const useWorkspaceStore = hmrSingleton("workspaceStore", createWorkspaceStore);
