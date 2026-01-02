/**
 * Asset Viewer Module
 *
 * Dockview-based asset viewer with customizable panels.
 */

export * from './panels';
export * from './types';
export * from './capabilities';

// Re-export stores from feature module
export * from '@features/mediaViewer';
export { AssetViewerDockview } from './AssetViewerDockview';
export type { AssetViewerDockviewProps } from './AssetViewerDockview';
