import type { DockviewApi } from "dockview-core";

type DockviewPanelPosition = Parameters<DockviewApi["addPanel"]>[0]["position"];

export interface ReconcileScopedDockviewPanelsDeps {
  ensurePanels: (
    api: DockviewApi,
    panelIds: Iterable<string>,
    options?: {
      resolveOptions?: (
        panelId: string,
        api: DockviewApi
      ) => {
        title?: string;
        position?: DockviewPanelPosition;
      } | undefined;
    }
  ) => string[];
  getDockviewPanels: (api: DockviewApi) => unknown[];
  resolvePanelDefinitionId: (panel: unknown) => string | undefined;
}

export interface ReconcileScopedDockviewPanelsArgs {
  api: DockviewApi;
  scopedPanelIds: readonly string[];
  excludedFromLayoutSet: ReadonlySet<string>;
  resolvePanelTitle: (panelId: string) => string;
  resolvePanelPosition?: (
    panelId: string,
    api: DockviewApi
  ) => DockviewPanelPosition;
  dockLabel: string;
}

/**
 * Reconcile dockview panels in two phases:
 * 1) ensure required in-scope panels are present
 * 2) prune out-of-layout panels
 *
 * Returns the number of panel-add failures.
 */
export function reconcileScopedDockviewPanels(
  args: ReconcileScopedDockviewPanelsArgs,
  deps: ReconcileScopedDockviewPanelsDeps,
): number {
  const {
    api,
    scopedPanelIds,
    excludedFromLayoutSet,
    resolvePanelTitle,
    resolvePanelPosition,
    dockLabel,
  } = args;

  const panelsToAdd = scopedPanelIds.filter(
    (panelId) => !excludedFromLayoutSet.has(panelId),
  );

  // Add required panels first. Removing out-of-layout panels before this
  // can transiently empty the grid and trigger "invalid location" errors.
  let failedCount = 0;
  for (const panelId of panelsToAdd) {
    if (api.getPanel(panelId)) continue;

    try {
      const position = resolvePanelPosition?.(panelId, api);
      const safePosition =
        position && "referencePanel" in position && position.referencePanel
          ? api.getPanel(position.referencePanel) ? position : undefined
          : position;

      const added = deps.ensurePanels(api, [panelId], {
        resolveOptions: () => ({
          title: resolvePanelTitle(panelId),
          position: safePosition,
        }),
      });
      if (added.length === 0) {
        failedCount++;
      }
    } catch (error) {
      failedCount++;
      console.warn(
        `[PanelHostDockview] Failed to add panel "${panelId}" to dock "${dockLabel}":`,
        error,
      );
    }
  }

  if (excludedFromLayoutSet.size > 0) {
    for (const panel of deps.getDockviewPanels(api)) {
      const panelRecord = panel as { id?: unknown };
      const panelId = typeof panelRecord.id === "string" ? panelRecord.id : undefined;
      const resolvedId = deps.resolvePanelDefinitionId(panel) ?? panelId;
      if (
        (panelId && excludedFromLayoutSet.has(panelId)) ||
        (resolvedId && excludedFromLayoutSet.has(resolvedId))
      ) {
        api.removePanel(panel);
      }
    }
  }

  return failedCount;
}
