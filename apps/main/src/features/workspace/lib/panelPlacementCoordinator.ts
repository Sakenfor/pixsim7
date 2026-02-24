import {
  getAllDockviewHosts,
  getDockviewHost,
  getDockviewPanels,
  resolvePanelDefinitionId,
  subscribeToDockviewRegistry,
  type DockviewHost,
} from "@pixsim7/shared.ui.dockview";

import { useWorkspaceStore, type WorkspaceActions, type WorkspaceState } from "../stores/workspaceStore";

import { getFloatingDefinitionId } from "./floatingPanelUtils";

type DockedDockSnapshot = {
  ids: string[];
  idSet: ReadonlySet<string>;
};

type PlacementSnapshot = {
  floatingDefinitionIds: string[];
  floatingDefinitionIdSet: ReadonlySet<string>;
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

function buildFloatingDefinitionIds(state: WorkspaceState): string[] {
  return state.floatingPanels.map((panel) => getFloatingDefinitionId(panel.id));
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

function scheduleTask(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(fn);
    return;
  }
  setTimeout(fn, 0);
}

let started = false;
let stopWorkspaceSubscription: (() => void) | null = null;
let stopDockviewRegistrySubscription: (() => void) | null = null;
let workspaceFloatingIds: string[] = [];
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
  const nextIds = buildFloatingDefinitionIds(state);
  const nextKey = buildKey(nextIds);
  if (nextKey === workspaceFloatingKey) {
    return;
  }
  workspaceFloatingIds = nextIds;
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
    scheduleTask(() => rebuildDockviewTracker(dockviewId));
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

  const dockedByDockview = new Map<string, DockedDockSnapshot>();
  for (const [dockviewId, tracker] of dockviewTrackers) {
    dockedByDockview.set(dockviewId, {
      ids: tracker.ids,
      idSet: new Set(tracker.ids),
    });
  }

  snapshotCache = {
    floatingDefinitionIds: workspaceFloatingIds,
    floatingDefinitionIdSet: new Set(workspaceFloatingIds),
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

type FloatingOpenOptions = Parameters<WorkspaceActions["openFloatingPanel"]>[1];
type DockFloatingPosition = Parameters<WorkspaceActions["dockFloatingPanel"]>[1];

type FloatingOriginMeta = {
  sourceDockviewId?: string | null;
  sourceGroupId?: string | null;
  sourceDockPanelId?: string | null;
  sourcePanelId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFloatingOriginMeta(context: unknown): FloatingOriginMeta | null {
  if (!isRecord(context)) return null;
  const raw = context.__floatingMeta;
  return isRecord(raw) ? (raw as FloatingOriginMeta) : null;
}

function stripFloatingMeta(context: unknown): Record<string, unknown> | undefined {
  if (!isRecord(context)) return undefined;
  const next = { ...context };
  delete (next as Record<string, unknown>).__floatingMeta;
  return next;
}

function normalizeDockPanelDefinitionId(panelId: string): string {
  return panelId.startsWith("dev-tool:") ? panelId.slice("dev-tool:".length) : panelId;
}

function getFloatingHostContextPayload(panel: unknown): Record<string, unknown> | undefined {
  if (!isRecord(panel)) return undefined;
  const direct = panel.__pixsimFloatingContextPayload;
  if (isRecord(direct)) return direct;
  const api = panel.api;
  if (isRecord(api) && isRecord(api.__pixsimFloatingContextPayload)) {
    return api.__pixsimFloatingContextPayload as Record<string, unknown>;
  }
  return undefined;
}

export const panelPlacementCoordinator = {
  subscribe(listener: Listener): () => void {
    ensureStarted();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getFloatingPanelDefinitionIds(): string[] {
    return getSnapshot().floatingDefinitionIds;
  },

  getFloatingPanelDefinitionIdSet(): ReadonlySet<string> {
    return getSnapshot().floatingDefinitionIdSet;
  },

  getDockedPanelDefinitionIds(dockviewId: string): string[] {
    return getSnapshot().dockedByDockview.get(dockviewId)?.ids ?? [];
  },

  getDockedPanelDefinitionIdSet(dockviewId: string): ReadonlySet<string> {
    return getSnapshot().dockedByDockview.get(dockviewId)?.idSet ?? new Set<string>();
  },

  isFloating(panelId: string): boolean {
    return getSnapshot().floatingDefinitionIdSet.has(panelId);
  },

  isDockedIn(dockviewId: string, panelId: string): boolean {
    return getSnapshot().dockedByDockview.get(dockviewId)?.idSet.has(panelId) ?? false;
  },

  getPlacements(panelId: string): PanelPlacement[] {
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
  },

  getExcludedPanelIds(panelIds: readonly string[]): string[] {
    const floating = getSnapshot().floatingDefinitionIdSet;
    return panelIds.filter((panelId) => floating.has(panelId));
  },

  /**
   * Current policy: floating wins over docked layouts.
   * This method leaves room for future scope/dock-specific policy rules.
   */
  getDockExclusions(_dockviewId: string, panelIds: readonly string[]): string[] {
    const floating = getSnapshot().floatingDefinitionIdSet;
    return panelIds.filter((panelId) => floating.has(panelId));
  },

  getDiagnostics(): PlacementDiagnostic[] {
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
  },

  hasConflicts(): boolean {
    return this.getDiagnostics().length > 0;
  },

  openFloatingPanel(panelId: string, options?: FloatingOpenOptions): void {
    useWorkspaceStore.getState().openFloatingPanel(panelId, options);
  },

  bringFloatingPanelToFront(floatingPanelId: string): void {
    useWorkspaceStore.getState().bringFloatingPanelToFront(floatingPanelId);
  },

  bringFloatingPanelDefinitionToFront(panelId: string): boolean {
    const match = useWorkspaceStore
      .getState()
      .floatingPanels.find((panel) => getFloatingDefinitionId(panel.id) === panelId);
    if (!match) return false;
    useWorkspaceStore.getState().bringFloatingPanelToFront(match.id);
    return true;
  },

  dockFloatingPanel(panelId: string, position: DockFloatingPosition): void {
    useWorkspaceStore.getState().dockFloatingPanel(panelId, position);
  },

  closeFloatingPanel(panelId: string): void {
    useWorkspaceStore.getState().closeFloatingPanel(panelId);
  },

  /**
   * If the floating panel has origin metadata and the source dockview is mounted,
   * close by restoring it to that dock. Falls back to a normal close.
   */
  closeFloatingPanelWithReturn(panelId: string): boolean {
    const state = useWorkspaceStore.getState();
    const floatingPanel = state.floatingPanels.find((panel) => panel.id === panelId);
    if (!floatingPanel) {
      return false;
    }

    const origin = getFloatingOriginMeta(floatingPanel.context);
    const sourceDockviewId = origin?.sourceDockviewId;
    if (!sourceDockviewId) {
      state.closeFloatingPanel(panelId);
      return false;
    }

    const host = getDockviewHost(sourceDockviewId);
    if (!host?.api) {
      state.closeFloatingPanel(panelId);
      return false;
    }

    const targetDefinitionId = normalizeDockPanelDefinitionId(
      origin?.sourcePanelId ?? getFloatingDefinitionId(panelId),
    );
    const targetInstanceId =
      typeof origin?.sourceDockPanelId === "string" && origin.sourceDockPanelId.length > 0
        ? origin.sourceDockPanelId
        : undefined;

    // Prefer focusing an existing panel before creating a new one.
    if (host.focusPanel(targetDefinitionId)) {
      state.closeFloatingPanel(panelId);
      return true;
    }

    const referencePanel = (() => {
      if (!targetInstanceId) return undefined;
      for (const panel of getDockviewPanels(host.api)) {
        if ((panel as any)?.id === targetInstanceId) {
          return targetInstanceId;
        }
      }
      return undefined;
    })();

    const params = stripFloatingMeta(floatingPanel.context);
    const addOptions =
      targetInstanceId && targetInstanceId !== targetDefinitionId
        ? {
            allowMultiple: true,
            instanceId: targetInstanceId,
            params,
            position: { direction: "within" as const, ...(referencePanel ? { referencePanel } : {}) },
          }
        : {
            allowMultiple: false,
            params,
            position: referencePanel
              ? ({ direction: "within", referencePanel } as const)
              : undefined,
          };

    // Remove floating first so placement/exclusion policy can update before restore.
    state.closeFloatingPanel(panelId);

    scheduleTask(() => {
      try {
        host.addPanel(targetDefinitionId, addOptions);
        // Ensure the restored panel is active.
        host.focusPanel(targetDefinitionId);
      } catch (error) {
        // Avoid data loss if restore fails unexpectedly.
        useWorkspaceStore.getState().restoreFloatingPanel(floatingPanel);
        console.warn("[panelPlacementCoordinator] Failed to return floating panel to origin", {
          panelId,
          sourceDockviewId,
          targetDefinitionId,
          error,
        });
      }
    });

    return true;
  },

  openFloatingFromDockviewPanel(args: {
    panel: any;
    dockPanelId?: string;
    sourceDockviewId?: string | null;
    sourceGroupId?: string | null;
    options?: Omit<NonNullable<FloatingOpenOptions>, "context"> & { context?: Record<string, unknown> };
  }): string | null {
    const {
      panel,
      dockPanelId,
      sourceDockviewId,
      sourceGroupId,
      options,
    } = args;
    if (!panel) return null;

    const resolvedPanelId =
      resolvePanelDefinitionId(panel) ??
      (typeof dockPanelId === "string" ? dockPanelId : undefined) ??
      (typeof panel?.id === "string" ? panel.id : undefined);
    if (!resolvedPanelId) return null;

    const existingContext =
      typeof panel?.params === "object" && panel.params !== null
        ? (panel.params as Record<string, unknown>)
        : typeof panel?.api?.params === "object" && panel.api.params !== null
          ? (panel.api.params as Record<string, unknown>)
          : {};

    const mergedContext = {
      ...existingContext,
      ...(existingContext.context == null && getFloatingHostContextPayload(panel)
        ? { context: getFloatingHostContextPayload(panel) }
        : {}),
      ...(options?.context ?? {}),
      __floatingMeta: {
        sourceDockviewId: sourceDockviewId ?? null,
        sourceGroupId: sourceGroupId ?? null,
        sourceDockPanelId: dockPanelId ?? (typeof panel?.id === "string" ? panel.id : null),
        sourcePanelId: resolvedPanelId,
      },
    };

    this.openFloatingPanel(resolvedPanelId, {
      ...(options ?? {}),
      context: mergedContext,
    });
    return resolvedPanelId;
  },

  /**
   * Test/dev utility for teardown. Not used in app flow.
   */
  _resetForTests(): void {
    stopWorkspaceSubscription?.();
    stopWorkspaceSubscription = null;
    stopDockviewRegistrySubscription?.();
    stopDockviewRegistrySubscription = null;
    for (const tracker of dockviewTrackers.values()) {
      disposeDockviewTracker(tracker);
    }
    dockviewTrackers = new Map();
    workspaceFloatingIds = [];
    workspaceFloatingKey = "";
    snapshotCache = null;
    snapshotVersion = 0;
    snapshotCacheVersion = -1;
    listeners.clear();
    started = false;
  },
};
