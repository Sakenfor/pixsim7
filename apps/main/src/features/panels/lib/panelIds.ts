/**
 * Canonical panel-definition IDs and dock-scope IDs used by panel hosts.
 *
 * Keep these centralized to avoid string drift between:
 * - panel metadata/orchestration IDs (camelCase)
 * - dock scopes / layout keys (kebab-case)
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
