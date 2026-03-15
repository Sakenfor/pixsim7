import {
  getAllDockviewHosts,
  getDockviewPanels,
  resolvePanelDefinitionId,
  subscribeToDockviewRegistry,
  type DockviewHost,
} from "@pixsim7/shared.ui.dockview";

import { readFloatingOriginMeta } from "@lib/dockview/floatingPanelInterop";

import { useWorkspaceStore, type WorkspaceState } from "../stores/workspaceStore";

import { getFloatingDefinitionId } from "./floatingPanelUtils";

type DockedDockSnapshot = {
  ids: string[];
  idSet: ReadonlySet<string>;
};

type PlacementSnapshot = {
  floatingDefinitionIds: string[];
  floatingDefinitionIdSet: ReadonlySet<string>;
  floatingDefinitionIdSetGlobal: ReadonlySet<string>;
  floatingDefinitionIdSetBySourceDockview: ReadonlyMap<string, ReadonlySet<string>>;
  dockedByDockview: ReadonlyMap<string, DockedDockSnapshot>;
};

type Listener = () => void;
type Disposable = { dispose: () => void };

type DockviewTracker = {
  dockviewId: string;
  api: DockviewHost["api"];
  ids: string[];
  key: string;
  disposables: Disposable[];
};

type FloatingPlacementEntry = {
  definitionId: string;
  sourceDockviewId: string | null;
};

function normalizeDockviewId(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function readSourceDockviewIdFromFloatingContext(
  context: Record<string, unknown> | undefined,
): string | null {
  if (!context) return null;
  const origin = readFloatingOriginMeta(context);
  const sourceDockviewId =
    typeof origin?.sourceDockviewId === "string" ? origin.sourceDockviewId : null;
  if (!sourceDockviewId) return null;
  const normalized = normalizeDockviewId(sourceDockviewId);
  return normalized.length > 0 ? normalized : null;
}

function buildFloatingPlacementEntries(state: WorkspaceState): FloatingPlacementEntry[] {
  return state.floatingPanels.map((panel) => {
    const definitionId = getFloatingDefinitionId(panel.id);
    const sourceDockviewId = readSourceDockviewIdFromFloatingContext(
      panel.context as Record<string, unknown> | undefined,
    );
    return { definitionId, sourceDockviewId };
  });
}

function buildFloatingKey(entries: readonly FloatingPlacementEntry[]): string {
  return entries.map((entry) => `${entry.definitionId}@${entry.sourceDockviewId ?? ""}`).join("\u0000");
}

function buildKey(ids: readonly string[]): string {
  return ids.join("\u0000");
}

function collectDockviewDefinitionIds(api: DockviewHost["api"]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const panel of getDockviewPanels(api)) {
    const resolved = resolvePanelDefinitionId(panel as any);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    ids.push(resolved);
  }
  return ids;
}

export function schedulePanelPlacementTask(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(fn);
    return;
  }
  setTimeout(fn, 0);
}

let started = false;
let stopWorkspaceSubscription: (() => void) | null = null;
let stopDockviewRegistrySubscription: (() => void) | null = null;
let workspaceFloatingEntries: FloatingPlacementEntry[] = [];
let workspaceFloatingKey = "";
let dockviewTrackers = new Map<string, DockviewTracker>();
let snapshotCache: PlacementSnapshot | null = null;
let snapshotVersion = 0;
let snapshotCacheVersion = -1;
const listeners = new Set<Listener>();

function notify(): void {
  snapshotVersion += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error("[panelPlacementCoordinator] listener failed:", error);
    }
  }
}

function refreshFloatingFromWorkspace(state: WorkspaceState): void {
  const nextEntries = buildFloatingPlacementEntries(state);
  const nextKey = buildFloatingKey(nextEntries);
  if (nextKey === workspaceFloatingKey) {
    return;
  }
  workspaceFloatingEntries = nextEntries;
  workspaceFloatingKey = nextKey;
  notify();
}

function rebuildDockviewTracker(dockviewId: string): void {
  const tracker = dockviewTrackers.get(dockviewId);
  if (!tracker) return;
  const nextIds = collectDockviewDefinitionIds(tracker.api);
  const nextKey = buildKey(nextIds);
  if (nextKey === tracker.key) {
    return;
  }
  tracker.ids = nextIds;
  tracker.key = nextKey;
  notify();
}

function disposeDockviewTracker(tracker: DockviewTracker): void {
  for (const disposable of tracker.disposables) {
    try {
      disposable.dispose();
    } catch {
      // no-op
    }
  }
}

function attachDockviewTracker(host: DockviewHost): void {
  const dockviewId = host.dockviewId;
  const existing = dockviewTrackers.get(dockviewId);
  if (existing?.api === host.api) {
    return;
  }
  if (existing) {
    disposeDockviewTracker(existing);
    dockviewTrackers.delete(dockviewId);
  }

  const tracker: DockviewTracker = {
    dockviewId,
    api: host.api,
    ids: collectDockviewDefinitionIds(host.api),
    key: "",
    disposables: [],
  };
  tracker.key = buildKey(tracker.ids);

  const scheduleRebuild = () => {
    // Coalesce panel mutations / fromJSON restores.
    schedulePanelPlacementTask(() => rebuildDockviewTracker(dockviewId));
  };

  tracker.disposables.push(host.api.onDidAddPanel(scheduleRebuild));
  tracker.disposables.push(host.api.onDidRemovePanel(scheduleRebuild));

  const maybeLayoutFromJson = (host.api as any).onDidLayoutFromJSON;
  if (typeof maybeLayoutFromJson === "function") {
    const disposable = maybeLayoutFromJson.call(host.api, scheduleRebuild);
    if (disposable && typeof disposable.dispose === "function") {
      tracker.disposables.push(disposable);
    }
  }

  dockviewTrackers.set(dockviewId, tracker);
  notify();
}

function syncDockviewTrackers(): void {
  const hosts = getAllDockviewHosts();
  const nextIds = new Set(hosts.map((host) => host.dockviewId));

  for (const host of hosts) {
    attachDockviewTracker(host);
  }

  for (const [dockviewId, tracker] of dockviewTrackers) {
    if (nextIds.has(dockviewId)) continue;
    disposeDockviewTracker(tracker);
    dockviewTrackers.delete(dockviewId);
    notify();
  }
}

function ensureStarted(): void {
  if (started) return;
  started = true;

  refreshFloatingFromWorkspace(useWorkspaceStore.getState());
  stopWorkspaceSubscription = useWorkspaceStore.subscribe((state) => {
    refreshFloatingFromWorkspace(state);
  });

  syncDockviewTrackers();
  stopDockviewRegistrySubscription = subscribeToDockviewRegistry(() => {
    syncDockviewTrackers();
  });
}

function getSnapshot(): PlacementSnapshot {
  ensureStarted();
  if (snapshotCache && snapshotCacheVersion === snapshotVersion) {
    return snapshotCache;
  }

  const floatingDefinitionIds = workspaceFloatingEntries.map((entry) => entry.definitionId);
  const floatingDefinitionIdSet = new Set(floatingDefinitionIds);
  const floatingDefinitionIdSetGlobal = new Set<string>();
  const floatingDefinitionIdSetBySourceDockviewMutable = new Map<string, Set<string>>();

  for (const entry of workspaceFloatingEntries) {
    const sourceDockviewId = entry.sourceDockviewId;
    if (!sourceDockviewId) {
      floatingDefinitionIdSetGlobal.add(entry.definitionId);
      continue;
    }
    const setForDockview = floatingDefinitionIdSetBySourceDockviewMutable.get(sourceDockviewId) ?? new Set<string>();
    setForDockview.add(entry.definitionId);
    floatingDefinitionIdSetBySourceDockviewMutable.set(sourceDockviewId, setForDockview);
  }

  const floatingDefinitionIdSetBySourceDockview = new Map<string, ReadonlySet<string>>();
  for (const [dockviewId, ids] of floatingDefinitionIdSetBySourceDockviewMutable) {
    floatingDefinitionIdSetBySourceDockview.set(dockviewId, ids);
  }

  const dockedByDockview = new Map<string, DockedDockSnapshot>();
  for (const [dockviewId, tracker] of dockviewTrackers) {
    dockedByDockview.set(dockviewId, {
      ids: tracker.ids,
      idSet: new Set(tracker.ids),
    });
  }

  snapshotCache = {
    floatingDefinitionIds,
    floatingDefinitionIdSet,
    floatingDefinitionIdSetGlobal,
    floatingDefinitionIdSetBySourceDockview,
    dockedByDockview,
  };
  snapshotCacheVersion = snapshotVersion;
  return snapshotCache;
}

export type PanelPlacement =
  | { kind: "floating" }
  | { kind: "docked"; dockviewId: string };

export interface PlacementDiagnostic {
  kind: "floating-and-docked" | "multi-docked";
  panelId: string;
  dockviewIds?: string[];
}

export function subscribePanelPlacement(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFloatingPanelDefinitionIds(): string[] {
  return getSnapshot().floatingDefinitionIds;
}

export function getFloatingPanelDefinitionIdSet(): ReadonlySet<string> {
  return getSnapshot().floatingDefinitionIdSet;
}

export function getDockedPanelDefinitionIds(dockviewId: string): string[] {
  return getSnapshot().dockedByDockview.get(dockviewId)?.ids ?? [];
}

export function getDockedPanelDefinitionIdSet(dockviewId: string): ReadonlySet<string> {
  return getSnapshot().dockedByDockview.get(dockviewId)?.idSet ?? new Set<string>();
}

export function isFloatingPanel(panelId: string): boolean {
  return getSnapshot().floatingDefinitionIdSet.has(panelId);
}

export function isPanelDockedIn(dockviewId: string, panelId: string): boolean {
  return getSnapshot().dockedByDockview.get(dockviewId)?.idSet.has(panelId) ?? false;
}

export function getPanelPlacements(panelId: string): PanelPlacement[] {
  const snapshot = getSnapshot();
  const placements: PanelPlacement[] = [];
  if (snapshot.floatingDefinitionIdSet.has(panelId)) {
    placements.push({ kind: "floating" });
  }
  for (const [dockviewId, dock] of snapshot.dockedByDockview) {
    if (dock.idSet.has(panelId)) {
      placements.push({ kind: "docked", dockviewId });
    }
  }
  return placements;
}

export function getExcludedFloatingPanelIds(panelIds: readonly string[]): string[] {
  const floating = getSnapshot().floatingDefinitionIdSet;
  return panelIds.filter((panelId) => floating.has(panelId));
}

/**
 * Current policy: floating wins over docked layouts.
 * This method leaves room for future scope/dock-specific policy rules.
 */
export function getDockPlacementExclusions(dockviewId: string, panelIds: readonly string[]): string[] {
  const snapshot = getSnapshot();
  const normalizedDockviewId = normalizeDockviewId(dockviewId);
  const scopedFloatingIds =
    normalizedDockviewId.length > 0
      ? snapshot.floatingDefinitionIdSetBySourceDockview.get(normalizedDockviewId)
      : undefined;

  return panelIds.filter((panelId) => {
    if (snapshot.floatingDefinitionIdSetGlobal.has(panelId)) return true;
    return scopedFloatingIds?.has(panelId) ?? false;
  });
}

export function getPanelPlacementDiagnostics(): PlacementDiagnostic[] {
  const snapshot = getSnapshot();
  const dockedByPanel = new Map<string, string[]>();

  for (const [dockviewId, dock] of snapshot.dockedByDockview) {
    for (const panelId of dock.ids) {
      const entries = dockedByPanel.get(panelId);
      if (entries) {
        entries.push(dockviewId);
      } else {
        dockedByPanel.set(panelId, [dockviewId]);
      }
    }
  }

  const diagnostics: PlacementDiagnostic[] = [];
  for (const [panelId, dockviewIds] of dockedByPanel) {
    if (snapshot.floatingDefinitionIdSet.has(panelId)) {
      diagnostics.push({
        kind: "floating-and-docked",
        panelId,
        dockviewIds: [...dockviewIds],
      });
    }
    if (dockviewIds.length > 1) {
      diagnostics.push({
        kind: "multi-docked",
        panelId,
        dockviewIds: [...dockviewIds],
      });
    }
  }
  return diagnostics;
}

export function hasPanelPlacementConflicts(): boolean {
  return getPanelPlacementDiagnostics().length > 0;
}

/**
 * Test/dev utility for teardown. Not used in app flow.
 */
export function resetPanelPlacementTrackingForTests(): void {
  stopWorkspaceSubscription?.();
  stopWorkspaceSubscription = null;
  stopDockviewRegistrySubscription?.();
  stopDockviewRegistrySubscription = null;
  for (const tracker of dockviewTrackers.values()) {
    disposeDockviewTracker(tracker);
  }
  dockviewTrackers = new Map();
  workspaceFloatingEntries = [];
  workspaceFloatingKey = "";
  snapshotCache = null;
  snapshotVersion = 0;
  snapshotCacheVersion = -1;
  listeners.clear();
  started = false;
}
