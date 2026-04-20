import { Z } from "@pixsim7/shared.ui";
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

/** Max z-index offset allowed for floating panels before normalization kicks in. */
const FLOAT_Z_BUDGET = Z.floatOverlay - Z.floatPanel - 1; // 99

const DEFAULT_FLOATING_PANEL_SIZE: Record<string, { width: number; height: number }> = {
  "ai-assistant": { width: 420, height: 520 },
  "agent-observability": { width: 900, height: 600 },
  "composition-roles": { width: 920, height: 680 },
  "dev-tools": { width: 800, height: 600 },
  "gallery": { width: 800, height: 600 },
  "generation-history": { width: 800, height: 500 },
  "generations": { width: 800, height: 600 },
  "mini-gallery": { width: 620, height: 520 },
  "plans": { width: 900, height: 600 },
  "prompt-library-inspector": { width: 1200, height: 760 },
  "providers": { width: 900, height: 700 },
  "quickgen-asset": { width: 640, height: 520 },
  "quickgen-settings": { width: 520, height: 440 },
  "settings": { width: 900, height: 700 },
};

function getDefaultFloatingPanelSize(panelId: string): { width: number; height: number } {
  const defId = getFloatingDefinitionId(panelId);
  if (defId.startsWith("dev-tool:")) {
    return { width: 800, height: 600 };
  }
  return DEFAULT_FLOATING_PANEL_SIZE[defId] ?? { width: 600, height: 400 };
}

/**
 * Pseudo dockview-id used for floating-panel dismissal so the same
 * dismissedPanels machinery can mark standalone floats as user-closed
 * without re-spawning on rehydrate.
 */
export const FLOATING_DISMISS_KEY = "floating";

/**
 * Normalize z-index values on floating panels so they stay within the safe
 * range (0 .. FLOAT_Z_BUDGET). Preserves relative stacking order.
 */
function normalizeFloatZIndices(panels: FloatingPanelState[]): FloatingPanelState[] {
  const maxZ = Math.max(...panels.map((p) => p.zIndex), 0);
  if (maxZ <= FLOAT_Z_BUDGET) return panels;
  const sorted = [...new Set(panels.map((p) => p.zIndex))].sort((a, b) => a - b);
  const rank = new Map(sorted.map((z, i) => [z, i]));
  return panels.map((p) => ({ ...p, zIndex: rank.get(p.zIndex)! }));
}

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
 * User-created sidebar shortcut group (iOS-style folder).
 * Children are panel:/page: keys only — no nested groups.
 */
export interface ShortcutGroupRecord {
  id: string;
  label: string;
  /** Optional override icon; when absent, UI renders a mini-grid of child icons. */
  icon?: string;
  /** Ordered list of shortcut keys ('panel:id' | 'page:id'). */
  childKeys: string[];
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
  /**
   * User-pinned sidebar shortcuts. Each entry is a shortcut key of the form
   * `'panel:<id>'`, `'page:<id>'`, or `'group:<groupId>'`. Order is user-controlled.
   * Groups themselves live in `shortcutGroups`.
   */
  pinnedShortcuts: string[];
  /**
   * User-created shortcut groups (iOS-style folders).
   * A group can only contain 'panel:' and 'page:' keys — no nested groups.
   */
  shortcutGroups: Record<string, ShortcutGroupRecord>;
  /** Remembered geometry for floating panels (persists across close/reopen) */
  lastFloatingPanelStates: Record<string, { x: number; y: number; width: number; height: number }>;
  /** Currently focused floating panel (others fade when set) */
  focusedFloatingPanelId: string | null;
  /**
   * Panels the user has explicitly dismissed from a dockview (tab X, context
   * menu "Close panel"). Keyed by dockviewId → panelIds. The reconciler treats
   * these as excluded so they don't immediately re-appear. Cleared when the
   * user re-opens the panel via context menu / pane shortcut.
   */
  dismissedPanels: Record<string, string[]>;
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
  /** Toggle a panel's pinned state (panel-only convenience — wraps toggleShortcutPin). */
  toggleQuickAddPin: (panelId: string) => void;
  /** Check if a panel is pinned (panel-only convenience — wraps isPinnedShortcut). */
  isPinnedQuickAdd: (panelId: string) => boolean;
  /** Toggle a shortcut key ('panel:id' or 'page:id') in pinnedShortcuts. */
  toggleShortcutPin: (key: string) => void;
  /** Check if a shortcut key is pinned. */
  isPinnedShortcut: (key: string) => boolean;
  /**
   * Move or insert a shortcut key in pinnedShortcuts.
   * If fromKey is already pinned, it's removed from its current slot first.
   * Then inserted before toKey (or appended if toKey is null or missing from list).
   * Serves both reorder (drag within pinned) and drag-in (pin from another source).
   */
  reorderShortcutPin: (fromKey: string, toKey: string | null) => void;
  /**
   * Merge two shortcut keys into a new group (iOS-style folder).
   * If `targetKey` is already a group key, `sourceKey` is added to it instead.
   * `sourceKey` may be a panel/page OR a member of another group (which is removed from that group).
   * Returns the group id.
   */
  mergeShortcutsIntoGroup: (sourceKey: string, targetKey: string) => string;
  /** Add a shortcut (panel/page) to an existing group. No-op for group-into-group. */
  addToShortcutGroup: (groupId: string, key: string) => void;
  /** Remove a child from a group. Auto-dissolves the group if ≤1 child remains. */
  removeFromShortcutGroup: (groupId: string, key: string, opts?: { promoteToPinned?: boolean }) => void;
  /** Rename a group. */
  renameShortcutGroup: (groupId: string, label: string) => void;
  /** Delete a group entirely; optionally flattens children back into pinnedShortcuts. */
  dissolveShortcutGroup: (groupId: string, opts?: { flatten?: boolean }) => void;
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
      /**
       * When true, provided geometry overrides remembered geometry.
       * Default false: user-resized geometry is preferred when available.
       */
      forceGeometry?: boolean;
      context?: Record<string, any>;
    },
  ) => void;
  closeFloatingPanel: (panelId: string, options?: { dismiss?: boolean }) => void;
  /** Swap a floating panel's definition in-place (keeps position, size, z-index). */
  replaceFloatingPanel: (panelId: string, newDefinitionId: string, context?: Record<string, any>) => void;
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
  /** Mark a panel dismissed from a dockview (user closed it). */
  dismissPanel: (dockviewId: string, panelId: string) => void;
  /** Clear dismissed flag so the reconciler can add the panel back. */
  undismissPanel: (dockviewId: string, panelId: string) => void;
  /** Whether a panel is currently dismissed from a dockview. */
  isPanelDismissed: (dockviewId: string, panelId: string) => boolean;
}

const STORAGE_KEY = "workspace_v9"; // v9: remove gallery from pinned (duplicate of page nav)

// ─────────────────────────────────────────────────────────
// Shortcut key helpers (module-scope, used by group actions)
// ─────────────────────────────────────────────────────────

type ShortcutKeyKind = 'panel' | 'page' | 'group';

function parseStoreKey(key: string): { kind: ShortcutKeyKind; id: string } | null {
  const sep = key.indexOf(':');
  if (sep === -1) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if ((kind !== 'panel' && kind !== 'page' && kind !== 'group') || !id) return null;
  return { kind, id };
}

function findOwningGroupId(
  childKey: string,
  groups: Record<string, ShortcutGroupRecord>,
): string | null {
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.childKeys.includes(childKey)) return groupId;
  }
  return null;
}

/**
 * If a group has ≤1 child, auto-dissolve it. The single remaining child (if any)
 * is promoted into the top-level pinned list at the group's previous position.
 * Mutates the passed-in state object in place.
 */
function autoDissolveIfNeeded(
  groupId: string,
  state: { pinnedShortcuts: string[]; shortcutGroups: Record<string, ShortcutGroupRecord> },
): void {
  const group = state.shortcutGroups[groupId];
  if (!group) return;
  if (group.childKeys.length > 1) return;
  const groupKey = `group:${groupId}`;
  const idx = state.pinnedShortcuts.indexOf(groupKey);
  const remaining = group.childKeys[0];
  const nextGroups = { ...state.shortcutGroups };
  delete nextGroups[groupId];
  state.shortcutGroups = nextGroups;
  if (idx === -1) {
    if (remaining && !state.pinnedShortcuts.includes(remaining)) {
      state.pinnedShortcuts = [...state.pinnedShortcuts, remaining];
    }
    return;
  }
  if (remaining && !state.pinnedShortcuts.includes(remaining)) {
    state.pinnedShortcuts = [
      ...state.pinnedShortcuts.slice(0, idx),
      remaining,
      ...state.pinnedShortcuts.slice(idx + 1),
    ];
  } else {
    state.pinnedShortcuts = state.pinnedShortcuts.filter((k) => k !== groupKey);
  }
}

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
      pinnedShortcuts: ['panel:inspector'],
      shortcutGroups: {},
      lastFloatingPanelStates: {},
      focusedFloatingPanelId: null,
      dismissedPanels: {},
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
        get().toggleShortcutPin(`panel:${panelId}`);
      },

      isPinnedQuickAdd: (panelId) => {
        return get().isPinnedShortcut(`panel:${panelId}`);
      },

      toggleShortcutPin: (key) => {
        const current = get().pinnedShortcuts;
        if (current.includes(key)) {
          set({ pinnedShortcuts: current.filter((k) => k !== key) });
        } else {
          set({ pinnedShortcuts: [...current, key] });
        }
      },

      isPinnedShortcut: (key) => {
        return get().pinnedShortcuts.includes(key);
      },

      reorderShortcutPin: (fromKey, toKey) => {
        if (fromKey === toKey) return;
        const current = get().pinnedShortcuts;
        const without = current.filter((k) => k !== fromKey);
        if (toKey === null) {
          set({ pinnedShortcuts: [...without, fromKey] });
          return;
        }
        const toIdx = without.indexOf(toKey);
        if (toIdx === -1) {
          set({ pinnedShortcuts: [...without, fromKey] });
          return;
        }
        const next = [...without.slice(0, toIdx), fromKey, ...without.slice(toIdx)];
        set({ pinnedShortcuts: next });
      },

      mergeShortcutsIntoGroup: (sourceKey, targetKey) => {
        if (sourceKey === targetKey) return '';
        const state = get();
        const sourceParsed = parseStoreKey(sourceKey);
        const targetParsed = parseStoreKey(targetKey);
        if (!sourceParsed || !targetParsed) return '';
        // Disallow merging a group INTO another group.
        if (sourceParsed.kind === 'group') return '';

        // Resolve the actual child payload for source (panel/page key).
        // Source may currently live inside another group — detach from there first.
        const sourceChildKey = sourceKey;
        const nextGroups = { ...state.shortcutGroups };
        let nextPinned = [...state.pinnedShortcuts];
        const prevOwner = findOwningGroupId(sourceKey, state.shortcutGroups);
        if (prevOwner) {
          const prev = nextGroups[prevOwner];
          nextGroups[prevOwner] = { ...prev, childKeys: prev.childKeys.filter((k) => k !== sourceKey) };
        } else {
          nextPinned = nextPinned.filter((k) => k !== sourceKey);
        }

        if (targetParsed.kind === 'group') {
          // Add to existing group.
          const target = nextGroups[targetParsed.id];
          if (!target) return '';
          if (!target.childKeys.includes(sourceChildKey)) {
            nextGroups[targetParsed.id] = { ...target, childKeys: [...target.childKeys, sourceChildKey] };
          }
          set({ pinnedShortcuts: nextPinned, shortcutGroups: nextGroups });
          // Check if old owner group auto-dissolves.
          if (prevOwner) {
            const finalState = { pinnedShortcuts: nextPinned, shortcutGroups: nextGroups };
            autoDissolveIfNeeded(prevOwner, finalState);
            set(finalState);
          }
          return targetParsed.id;
        }

        // Target is a flat panel/page — create a new group replacing the target slot.
        const groupId = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const groupKey = `group:${groupId}`;
        const record: ShortcutGroupRecord = {
          id: groupId,
          label: 'Group',
          childKeys: [targetKey, sourceChildKey],
        };
        nextGroups[groupId] = record;
        const targetIdx = nextPinned.indexOf(targetKey);
        if (targetIdx === -1) {
          nextPinned = [...nextPinned, groupKey];
        } else {
          nextPinned = [
            ...nextPinned.slice(0, targetIdx),
            groupKey,
            ...nextPinned.slice(targetIdx + 1),
          ];
        }
        const finalState = { pinnedShortcuts: nextPinned, shortcutGroups: nextGroups };
        if (prevOwner) autoDissolveIfNeeded(prevOwner, finalState);
        set(finalState);
        return groupId;
      },

      addToShortcutGroup: (groupId, key) => {
        const state = get();
        const group = state.shortcutGroups[groupId];
        if (!group) return;
        const parsed = parseStoreKey(key);
        if (!parsed || parsed.kind === 'group') return;
        if (group.childKeys.includes(key)) return;

        const nextGroups = { ...state.shortcutGroups };
        let nextPinned = [...state.pinnedShortcuts];
        const prevOwner = findOwningGroupId(key, state.shortcutGroups);
        if (prevOwner && prevOwner !== groupId) {
          const prev = nextGroups[prevOwner];
          nextGroups[prevOwner] = { ...prev, childKeys: prev.childKeys.filter((k) => k !== key) };
        } else if (!prevOwner) {
          nextPinned = nextPinned.filter((k) => k !== key);
        }
        nextGroups[groupId] = { ...group, childKeys: [...group.childKeys, key] };
        const finalState = { pinnedShortcuts: nextPinned, shortcutGroups: nextGroups };
        if (prevOwner && prevOwner !== groupId) autoDissolveIfNeeded(prevOwner, finalState);
        set(finalState);
      },

      removeFromShortcutGroup: (groupId, key, opts) => {
        const state = get();
        const group = state.shortcutGroups[groupId];
        if (!group) return;
        if (!group.childKeys.includes(key)) return;
        const nextGroups = {
          ...state.shortcutGroups,
          [groupId]: { ...group, childKeys: group.childKeys.filter((k) => k !== key) },
        };
        let nextPinned = state.pinnedShortcuts;
        if (opts?.promoteToPinned && !nextPinned.includes(key)) {
          // Insert at the group's position so the promoted item replaces the vacated slot visually.
          const groupKey = `group:${groupId}`;
          const idx = nextPinned.indexOf(groupKey);
          if (idx === -1) nextPinned = [...nextPinned, key];
          else nextPinned = [...nextPinned.slice(0, idx + 1), key, ...nextPinned.slice(idx + 1)];
        }
        const finalState = { pinnedShortcuts: nextPinned, shortcutGroups: nextGroups };
        autoDissolveIfNeeded(groupId, finalState);
        set(finalState);
      },

      renameShortcutGroup: (groupId, label) => {
        const state = get();
        const group = state.shortcutGroups[groupId];
        if (!group) return;
        set({
          shortcutGroups: { ...state.shortcutGroups, [groupId]: { ...group, label } },
        });
      },

      dissolveShortcutGroup: (groupId, opts) => {
        const state = get();
        const group = state.shortcutGroups[groupId];
        if (!group) return;
        const nextGroups = { ...state.shortcutGroups };
        delete nextGroups[groupId];
        const groupKey = `group:${groupId}`;
        const pinnedIdx = state.pinnedShortcuts.indexOf(groupKey);
        let nextPinned = state.pinnedShortcuts.filter((k) => k !== groupKey);
        if (opts?.flatten && group.childKeys.length > 0) {
          const toInsert = group.childKeys.filter((k) => !nextPinned.includes(k));
          if (pinnedIdx === -1) {
            nextPinned = [...nextPinned, ...toInsert];
          } else {
            nextPinned = [...nextPinned.slice(0, pinnedIdx), ...toInsert, ...nextPinned.slice(pinnedIdx)];
          }
        }
        set({ pinnedShortcuts: nextPinned, shortcutGroups: nextGroups });
      },

      reset: () =>
        set({
          closedPanels: [],
          isLocked: false,
          fullscreenPanel: null,
          floatingPanels: [],
          pinnedShortcuts: ['panel:inspector'],
          shortcutGroups: {},
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

        const { x, y, width, height, forceGeometry = false, context } = options;
        const defaultSize = getDefaultFloatingPanelSize(panelId);
        const resolveGeometry = (savedValue: number | undefined, providedValue: number | undefined, fallback: number) => {
          if (forceGeometry) return providedValue ?? savedValue ?? fallback;
          return savedValue ?? providedValue ?? fallback;
        };
        // Opening a float clears any standalone-dismiss marker.
        get().undismissPanel(FLOATING_DISMISS_KEY, panelId);
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
          const finalWidth = resolveGeometry(saved?.width, width, defaultSize.width);
          const finalHeight = resolveGeometry(saved?.height, height, defaultSize.height);
          const rawX = resolveGeometry(saved?.x, x, (window.innerWidth - finalWidth) / 2);
          const rawY = resolveGeometry(saved?.y, y, (window.innerHeight - finalHeight) / 2);
          const finalX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(finalWidth, 100)));
          const finalY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(finalHeight, 40)));
          const maxZ = Math.max(...floatingPanels.map((p) => p.zIndex), 0);

          set({
            floatingPanels: normalizeFloatZIndices([
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
            ]),
            focusedFloatingPanelId: floatingId,
          });
          return;
        }

        // Single-instance: existing behavior (focus if already open)
        const existing = get().floatingPanels.find((p) => p.id === panelId);
        if (existing) {
          const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);
          const nextWidth = forceGeometry ? (width ?? existing.width) : existing.width;
          const nextHeight = forceGeometry ? (height ?? existing.height) : existing.height;
          const rawX = forceGeometry ? (x ?? existing.x) : existing.x;
          const rawY = forceGeometry ? (y ?? existing.y) : existing.y;
          const nextX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(nextWidth, 100)));
          const nextY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(nextHeight, 40)));
          const nextContext =
            context != null
              ? { ...(existing.context ?? {}), ...context }
              : existing.context;
          set({
            floatingPanels: normalizeFloatZIndices(
              get().floatingPanels.map((p) =>
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
            ),
            focusedFloatingPanelId: panelId,
          });
          return;
        }

        const saved = get().lastFloatingPanelStates[panelId];
        const finalWidth = resolveGeometry(saved?.width, width, defaultSize.width);
        const finalHeight = resolveGeometry(saved?.height, height, defaultSize.height);
        const rawX = resolveGeometry(saved?.x, x, (window.innerWidth - finalWidth) / 2);
        const rawY = resolveGeometry(saved?.y, y, (window.innerHeight - finalHeight) / 2);
        // Clamp to viewport so panels don't appear off-screen
        const finalX = Math.max(0, Math.min(rawX, window.innerWidth - Math.min(finalWidth, 100)));
        const finalY = Math.max(0, Math.min(rawY, window.innerHeight - Math.min(finalHeight, 40)));
        const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);

        set({
          floatingPanels: normalizeFloatZIndices([
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
          ]),
          focusedFloatingPanelId: panelId,
        });
      },

      dismissPanel: (dockviewId, panelId) => {
        if (!dockviewId || !panelId) return;
        const current = get().dismissedPanels[dockviewId] ?? [];
        if (current.includes(panelId)) return;
        set({
          dismissedPanels: {
            ...get().dismissedPanels,
            [dockviewId]: [...current, panelId],
          },
        });
      },

      undismissPanel: (dockviewId, panelId) => {
        if (!dockviewId || !panelId) return;
        const current = get().dismissedPanels[dockviewId];
        if (!current || !current.includes(panelId)) return;
        const next = current.filter((id) => id !== panelId);
        const rest = { ...get().dismissedPanels };
        if (next.length === 0) {
          delete rest[dockviewId];
        } else {
          rest[dockviewId] = next;
        }
        set({ dismissedPanels: rest });
      },

      isPanelDismissed: (dockviewId, panelId) => {
        const list = get().dismissedPanels[dockviewId];
        return !!list && list.includes(panelId);
      },

      closeFloatingPanel: (panelId, options) => {
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
        if (options?.dismiss) {
          get().dismissPanel(FLOATING_DISMISS_KEY, defId);
        }
      },

      replaceFloatingPanel: (panelId, newDefinitionId, context) => {
        set({
          floatingPanels: get().floatingPanels.map((p) => {
            if (p.id !== panelId) return p;
            // Keep geometry, swap identity + context
            return { ...p, id: newDefinitionId, context: context ?? {} };
          }),
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
        get().undismissPanel(FLOATING_DISMISS_KEY, defId);
        set({
          floatingPanels: [...get().floatingPanels, panelState],
        });
      },

      updateFloatingPanelPosition: (panelId, x, y) => {
        const defId = getFloatingDefinitionId(panelId);
        const panel = get().floatingPanels.find((p) => p.id === panelId);
        const prev = get().lastFloatingPanelStates[defId];
        const defaultSize = getDefaultFloatingPanelSize(panelId);
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, x, y } : p,
          ),
          lastFloatingPanelStates: {
            ...get().lastFloatingPanelStates,
            [defId]: {
              x,
              y,
              width: prev?.width ?? panel?.width ?? defaultSize.width,
              height: prev?.height ?? panel?.height ?? defaultSize.height,
            },
          },
        });
      },

      updateFloatingPanelSize: (panelId, width, height) => {
        const defId = getFloatingDefinitionId(panelId);
        const panel = get().floatingPanels.find((p) => p.id === panelId);
        const prev = get().lastFloatingPanelStates[defId];
        const defaultSize = getDefaultFloatingPanelSize(panelId);
        const nextWidth = Number.isFinite(width) ? width : (prev?.width ?? panel?.width ?? defaultSize.width);
        const nextHeight = Number.isFinite(height) ? height : (prev?.height ?? panel?.height ?? defaultSize.height);
        set({
          floatingPanels: get().floatingPanels.map((p) =>
            p.id === panelId ? { ...p, width: nextWidth, height: nextHeight } : p,
          ),
          lastFloatingPanelStates: {
            ...get().lastFloatingPanelStates,
            [defId]: {
              x: prev?.x ?? panel?.x ?? 0,
              y: prev?.y ?? panel?.y ?? 0,
              width: nextWidth,
              height: nextHeight,
            },
          },
        });
      },

      bringFloatingPanelToFront: (panelId) => {
        const maxZ = Math.max(...get().floatingPanels.map((p) => p.zIndex), 0);
        set({
          floatingPanels: normalizeFloatZIndices(
            get().floatingPanels.map((p) =>
              p.id === panelId ? { ...p, zIndex: maxZ + 1 } : p,
            ),
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
            } else {
              // Panel not supported by target scope and no origin to fall back to.
              // Don't force it into an incompatible dock — keep it floating.
              console.warn("[dockFloatingPanel] Panel not supported by target scope, no origin fallback:", {
                panelId,
                defId,
                requestedDockviewId,
                targetDockviewId,
              });
              return;
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
      version: 11, // v11: add shortcutGroups for iOS-style folders
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
        if (version < 10) {
          // Unify shortcuts: old pinnedQuickAddPanels (string[]) → pinnedShortcuts with 'panel:' prefix
          const legacy: unknown = persistedState.pinnedQuickAddPanels;
          if (Array.isArray(legacy)) {
            persistedState.pinnedShortcuts = legacy
              .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
              .map((id: string) => `panel:${id}`);
          } else if (!Array.isArray(persistedState.pinnedShortcuts)) {
            persistedState.pinnedShortcuts = ['panel:inspector'];
          }
          delete persistedState.pinnedQuickAddPanels;
        }
        if (version < 11) {
          if (typeof persistedState.shortcutGroups !== 'object' || persistedState.shortcutGroups === null) {
            persistedState.shortcutGroups = {};
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
        pinnedShortcuts: state.pinnedShortcuts,
        shortcutGroups: state.shortcutGroups,
        lastFloatingPanelStates: state.lastFloatingPanelStates,
        activePresetByScope: state.activePresetByScope,
        dismissedPanels: state.dismissedPanels,
      }) as Partial<WorkspaceState & WorkspaceActions>,
      onRehydrateStorage: () => (state) => {
        if (state && !Array.isArray(state.floatingPanels)) {
          state.floatingPanels = [];
        }
        if (state && (typeof state.lastFloatingPanelStates !== 'object' || state.lastFloatingPanelStates === null)) {
          state.lastFloatingPanelStates = {};
        }
        if (state && (typeof state.dismissedPanels !== 'object' || state.dismissedPanels === null)) {
          state.dismissedPanels = {};
        }
        if (state && (typeof state.shortcutGroups !== 'object' || state.shortcutGroups === null)) {
          state.shortcutGroups = {};
        }
        // Self-heal: remove empty groups, promote single-child groups to flat pins,
        // and strip dangling group:<id> references from pinnedShortcuts.
        if (state && state.shortcutGroups && Array.isArray(state.pinnedShortcuts)) {
          const groups = state.shortcutGroups;
          let pinned = state.pinnedShortcuts;
          for (const [groupId, group] of Object.entries(groups)) {
            if (!group || !Array.isArray(group.childKeys) || group.childKeys.length <= 1) {
              const groupKey = `group:${groupId}`;
              const idx = pinned.indexOf(groupKey);
              const remaining = group?.childKeys?.[0];
              if (idx !== -1 && remaining && !pinned.includes(remaining)) {
                pinned = [...pinned.slice(0, idx), remaining, ...pinned.slice(idx + 1)];
              } else {
                pinned = pinned.filter((k) => k !== groupKey);
              }
              delete groups[groupId];
            }
          }
          // Strip any remaining dangling group keys whose record was never persisted.
          pinned = pinned.filter((k) => {
            if (!k.startsWith('group:')) return true;
            return k.slice(6) in groups;
          });
          state.pinnedShortcuts = pinned;
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
