/**
 * Asset Viewer Types
 *
 * Shared types for the asset viewer panels.
 */

import type { ViewerAsset } from '@features/assets';
import type { DockviewApi } from 'dockview-core';

/**
 * Settings for the asset viewer
 */
export interface ViewerSettings {
  autoPlayVideos: boolean;
  loopVideos: boolean;
}

/**
 * Context passed to all viewer panels
 */
export interface ViewerPanelContext {
  /** Current asset being viewed */
  asset: ViewerAsset | null;
  /** Viewer settings */
  settings: ViewerSettings;
  /** Current index in the asset list (0-based) */
  currentIndex: number;
  /** Total number of assets in the list */
  assetListLength: number;
  /** Whether we can navigate to previous asset */
  canNavigatePrev: boolean;
  /** Whether we can navigate to next asset */
  canNavigateNext: boolean;
  /** Navigate to previous asset */
  navigatePrev: () => void;
  /** Navigate to next asset */
  navigateNext: () => void;
  /** Close the viewer */
  closeViewer: () => void;
  /** Toggle fullscreen mode */
  toggleFullscreen: () => void;
  /** Dockview API for controlling layout */
  dockviewApi?: DockviewApi;
}
