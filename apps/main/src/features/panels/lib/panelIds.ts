/**
 * Canonical IDs for core system panels referenced across multiple features.
 *
 * Only add an ID here when it is used in cross-feature interaction rules,
 * orchestration metadata, or dock state selectors. Panels that are only
 * referenced locally should use string literals at the call site.
 */
export const PANEL_IDS = {
  assetViewer: 'assetViewer',
  controlCenter: 'controlCenter',
  workspace: 'workspace',
} as const;

export const DOCK_IDS = {
  assetViewer: 'asset-viewer',
  controlCenter: 'control-center',
  workspace: 'workspace',
} as const;

export type PanelId = (typeof PANEL_IDS)[keyof typeof PANEL_IDS];
export type DockId = (typeof DOCK_IDS)[keyof typeof DOCK_IDS];
