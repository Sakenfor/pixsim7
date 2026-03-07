import {
  getDockviewHost,
  getDockviewPanels,
  resolvePanelDefinitionId,
} from "@pixsim7/shared.ui.dockview";

import {
  buildFloatingOriginMetaRecord,
  readFloatingHostContextPayload,
  readFloatingOriginMeta,
  stripFloatingOriginMeta,
} from "@lib/dockview/floatingPanelInterop";

import { useWorkspaceStore, type WorkspaceActions } from "../stores/workspaceStore";

import { getFloatingDefinitionId } from "./floatingPanelUtils";
import { schedulePanelPlacementTask } from "./panelPlacementTracking";

export type PanelPlacementFloatingOpenOptions = Parameters<WorkspaceActions["openFloatingPanel"]>[1];
export type PanelPlacementDockFloatingPosition = Parameters<WorkspaceActions["dockFloatingPanel"]>[1];

export interface OpenFloatingFromDockviewPanelArgs {
  panel: any;
  dockPanelId?: string;
  sourceDockviewId?: string | null;
  sourceGroupId?: string | null;
  options?: Omit<NonNullable<PanelPlacementFloatingOpenOptions>, "context"> & {
    context?: Record<string, unknown>;
  };
}

function normalizeDockPanelDefinitionId(panelId: string): string {
  return panelId.startsWith("dev-tool:") ? panelId.slice("dev-tool:".length) : panelId;
}

function buildPanelInstanceId(
  dockviewId: string | null | undefined,
  panelId: string,
): string {
  if (dockviewId && dockviewId.length > 0) {
    const prefixed = `${dockviewId}:`;
    if (panelId.startsWith(prefixed)) {
      return panelId;
    }
    return `${dockviewId}:${panelId}`;
  }
  return panelId;
}

export function openFloatingPanelPlacement(
  panelId: string,
  options?: PanelPlacementFloatingOpenOptions,
): void {
  useWorkspaceStore.getState().openFloatingPanel(panelId, options);
}

export function bringFloatingPanelToFrontPlacement(floatingPanelId: string): void {
  useWorkspaceStore.getState().bringFloatingPanelToFront(floatingPanelId);
}

export function bringFloatingPanelDefinitionToFrontPlacement(panelId: string): boolean {
  const match = useWorkspaceStore
    .getState()
    .floatingPanels.find((panel) => getFloatingDefinitionId(panel.id) === panelId);
  if (!match) return false;
  useWorkspaceStore.getState().bringFloatingPanelToFront(match.id);
  return true;
}

export function dockFloatingPanelPlacement(
  panelId: string,
  position: PanelPlacementDockFloatingPosition,
): void {
  useWorkspaceStore.getState().dockFloatingPanel(panelId, position);
}

export function closeFloatingPanelPlacement(panelId: string): void {
  useWorkspaceStore.getState().closeFloatingPanel(panelId);
}

/**
 * If the floating panel has origin metadata and the source dockview is mounted,
 * close by restoring it to that dock. Falls back to a normal close.
 */
export function closeFloatingPanelWithReturnToOrigin(panelId: string): boolean {
  const state = useWorkspaceStore.getState();
  const floatingPanel = state.floatingPanels.find((panel) => panel.id === panelId);
  if (!floatingPanel) {
    return false;
  }

  const origin = readFloatingOriginMeta(floatingPanel.context);
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

  const targetDefinitionId =
    typeof origin?.sourceDefinitionId === "string" && origin.sourceDefinitionId.length > 0
      ? normalizeDockPanelDefinitionId(origin.sourceDefinitionId)
      : null;
  if (!targetDefinitionId) {
    console.warn("[panelPlacementCoordinator] Missing sourceDefinitionId in floating origin metadata", {
      panelId,
      sourceDockviewId,
      origin,
    });
    state.closeFloatingPanel(panelId);
    return false;
  }
  const sourceGroupId =
    typeof origin?.sourceGroupId === "string" && origin.sourceGroupId.length > 0
      ? origin.sourceGroupId
      : undefined;
  // sourceInstanceId is the scope-level ID (dockviewId:panelId). Extract the
  // original dockview panel ID by stripping the dockview prefix so we don't
  // create a double-prefixed instance when re-adding to the same dockview.
  const rawSourceInstanceId =
    typeof origin?.sourceInstanceId === "string" && origin.sourceInstanceId.length > 0
      ? origin.sourceInstanceId
      : undefined;
  const targetInstanceId = (() => {
    if (!rawSourceInstanceId) return undefined;
    const prefix = `${sourceDockviewId}:`;
    if (rawSourceInstanceId.startsWith(prefix)) {
      return rawSourceInstanceId.slice(prefix.length);
    }
    return rawSourceInstanceId;
  })();
  const sourceGroup =
    sourceGroupId && typeof (host.api as any).getGroup === "function"
      ? (host.api as any).getGroup(sourceGroupId)
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
  const hintedReferenceGroup =
    typeof origin?.sourceGroupRestoreHint?.referenceGroupId === "string" &&
    origin.sourceGroupRestoreHint.referenceGroupId.length > 0 &&
    typeof (host.api as any).getGroup === "function"
      ? (host.api as any).getGroup(origin.sourceGroupRestoreHint.referenceGroupId)
      : undefined;
  const hintedDirection = origin?.sourceGroupRestoreHint?.direction;

  const restorePosition = (() => {
    if (sourceGroup) {
      // Prefer restoring into the original group if it still exists.
      return { direction: "within" as const, referenceGroup: sourceGroup } as any;
    }
    if (referencePanel) {
      return { direction: "within" as const, referencePanel } as const;
    }
    if (
      hintedReferenceGroup &&
      (hintedDirection === "left" ||
        hintedDirection === "right" ||
        hintedDirection === "above" ||
        hintedDirection === "below")
    ) {
      // Recreate the original split relative to the nearest surviving group.
      return { direction: hintedDirection, referenceGroup: hintedReferenceGroup } as any;
    }
    return undefined;
  })();

  const params = stripFloatingOriginMeta(floatingPanel.context);
  const addOptions =
    targetInstanceId && targetInstanceId !== targetDefinitionId
      ? {
          allowMultiple: true,
          instanceId: targetInstanceId,
          params,
          position: restorePosition,
        }
      : {
          allowMultiple: false,
          params,
          position: restorePosition,
        };

  // Remove floating first so placement/exclusion policy can update before restore.
  state.closeFloatingPanel(panelId);

  schedulePanelPlacementTask(() => {
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
}

export function openFloatingFromDockviewPanelPlacement(
  args: OpenFloatingFromDockviewPanelArgs,
): string | null {
  const {
    panel,
    dockPanelId,
    sourceDockviewId,
    sourceGroupId,
    options,
  } = args;
  if (!panel) return null;

  const resolvedDefinitionId = resolvePanelDefinitionId(panel);
  if (!resolvedDefinitionId) {
    console.warn("[panelPlacementCoordinator] Could not resolve panel definition id for floating", {
      dockPanelId,
      panelId: typeof panel?.id === "string" ? panel.id : null,
      sourceDockviewId,
    });
    return null;
  }

  const existingContext =
    typeof panel?.params === "object" && panel.params !== null
      ? (panel.params as Record<string, unknown>)
      : typeof panel?.api?.params === "object" && panel.api.params !== null
        ? (panel.api.params as Record<string, unknown>)
        : {};

  const floatingHostContext = readFloatingHostContextPayload(panel);
  const existingPanelContext =
    typeof existingContext.context === "object" && existingContext.context !== null
      ? (existingContext.context as Record<string, unknown>)
      : undefined;
  const mergedPanelContext = floatingHostContext
    ? {
        ...(existingPanelContext ?? {}),
        ...floatingHostContext,
      }
    : existingPanelContext;
  const incomingOriginMeta = readFloatingOriginMeta(options?.context);
  const sourcePanelId =
    typeof dockPanelId === "string"
      ? dockPanelId
      : typeof panel?.id === "string"
        ? panel.id
        : null;
  const sourceInstanceId = sourcePanelId
    ? buildPanelInstanceId(sourceDockviewId ?? null, sourcePanelId)
    : null;
  const mergedContext = {
    ...existingContext,
    ...(mergedPanelContext ? { context: mergedPanelContext } : {}),
    ...(options?.context ?? {}),
    ...buildFloatingOriginMetaRecord({
      sourceDockviewId: sourceDockviewId ?? null,
      sourceGroupId: sourceGroupId ?? null,
      sourceInstanceId,
      sourceDefinitionId: resolvedDefinitionId,
      sourceGroupRestoreHint: incomingOriginMeta?.sourceGroupRestoreHint ?? null,
    }),
  };

  useWorkspaceStore.getState().openFloatingPanel(resolvedDefinitionId, {
    ...(options ?? {}),
    context: mergedContext,
  });
  return resolvedDefinitionId;
}
