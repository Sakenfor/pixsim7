/**
 * Asset Viewer Module
 *
 * Dockview-based asset viewer with customizable panels.
 */

export * from './panels';
export * from './types';
export { viewerPanelRegistry, createViewerPanelRegistry, type ViewerPanelId } from './viewerPanelRegistry';
export { AssetViewerDockview } from './AssetViewerDockview';
export type { AssetViewerDockviewProps } from './AssetViewerDockview';
