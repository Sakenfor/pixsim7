/**
 * AssetViewerDockview
 *
 * Dockview-based asset viewer with resizable, rearrangeable panels.
 * Uses SmartDockview for smart tab visibility (tabs shown only when grouped).
 *
 * Default layout:
 * ┌─────────────────────────────┐
 * │                             │
 * │      Media Preview          │
 * │                             │
 * ├──────────────┬──────────────┤
 * │ Quick Gen    │  Metadata    │
 * │ (prompt+go)  │  (info)      │
 * └──────────────┴──────────────┘
 */

import { useMemo, useState, useCallback } from 'react';
import type { DockviewApi } from 'dockview-core';
import { SmartDockview } from '@lib/dockview';
import { viewerPanelRegistry } from './viewerPanelRegistry';
import type { ViewerPanelContext, ViewerSettings } from './types';
import type { ViewerAsset } from '@features/assets';

export interface AssetViewerDockviewProps {
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
  /** Additional class name */
  className?: string;
  /** Panel manager ID for orchestration */
  panelManagerId?: string;
}

/**
 * Create the default panel layout
 */
function createDefaultLayout(api: DockviewApi, _registry?: any) {
  console.log('[AssetViewerDockview] Creating default layout');

  // Media panel takes the top area
  api.addPanel({
    id: 'media',
    component: 'media',
    title: 'Preview',
  });
  console.log('[AssetViewerDockview] Added media panel');

  // Quick generate panel (global) below media
  api.addPanel({
    id: 'quickGenerate',
    component: 'quickGenerate',
    title: 'Generate',
    position: {
      direction: 'below',
      referencePanel: 'media',
    },
  });
  console.log('[AssetViewerDockview] Added quickGenerate panel (global)');

  // Info panel (global) in same group as quickgen (creates tabs)
  // This puts both panels in tabs so user can switch between them
  // Saves vertical space and makes metadata accessible via tab
  const quickGenPanel = api.getPanel('quickGenerate');
  if (quickGenPanel) {
    api.addPanel({
      id: 'info',
      component: 'info',
      title: 'Metadata',
      position: {
        referencePanel: 'quickGenerate',
        // No direction = add to same group (creates tabs)
      },
    });
    console.log('[AssetViewerDockview] Added info panel (global) as tab');
  } else {
    // Fallback if quickgen panel not found
    api.addPanel({
      id: 'info',
      component: 'info',
      title: 'Metadata',
      position: {
        direction: 'below',
        referencePanel: 'media',
      },
    });
    console.log('[AssetViewerDockview] Added info panel (global) as separate panel');
  }

  // Set initial sizes - media gets more space (75% of height)
  try {
    const groups = api.groups;
    if (groups.length >= 2) {
      // Calculate 75% of available height for media panel
      const viewportHeight = window.innerHeight;
      const mediaHeight = Math.floor(viewportHeight * 0.75);

      // First group is media (top), second group is bottom panels
      api.getGroup(groups[0].id)?.api.setSize({ height: mediaHeight });

      console.log('[AssetViewerDockview] Set media panel height to', mediaHeight, 'px (75% of viewport)');
    }
  } catch (e) {
    console.warn('[AssetViewerDockview] Failed to set initial sizes:', e);
  }

  console.log('[AssetViewerDockview] Layout creation complete, total panels:', api.panels.length);
}

export function AssetViewerDockview({
  asset,
  settings,
  currentIndex,
  assetListLength,
  canNavigatePrev,
  canNavigateNext,
  navigatePrev,
  navigateNext,
  closeViewer,
  toggleFullscreen,
  className,
  panelManagerId,
}: AssetViewerDockviewProps) {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | undefined>(undefined);

  // Build context for panels (includes both ViewerPanelContext and WorkspaceContext fields)
  const context = useMemo(
    () => ({
      // ViewerPanelContext fields (for local media panel)
      asset,
      settings,
      currentIndex,
      assetListLength,
      canNavigatePrev,
      canNavigateNext,
      navigatePrev,
      navigateNext,
      closeViewer,
      toggleFullscreen,
      dockviewApi,
      // WorkspaceContext fields (for global panels)
      currentAsset: asset,
      currentSceneId: null,
    }),
    [
      asset,
      settings,
      currentIndex,
      assetListLength,
      canNavigatePrev,
      canNavigateNext,
      navigatePrev,
      navigateNext,
      closeViewer,
      toggleFullscreen,
      dockviewApi,
    ]
  );

  // Capture dockview API when ready
  const handleReady = useCallback((api: DockviewApi) => {
    console.log('[AssetViewerDockview] Dockview ready, capturing API');
    setDockviewApi(api);
  }, []);

  // Log registry info for debugging
  console.log('[AssetViewerDockview] Registry panels:', viewerPanelRegistry.getAll().map(p => p.id));
  console.log('[AssetViewerDockview] Using global panels: quickGenerate, info');

  return (
    <SmartDockview
      registry={viewerPanelRegistry}
      storageKey="asset-viewer-layout-v2" // Changed key to force new layout
      context={context}
      defaultLayout={createDefaultLayout}
      minPanelsForTabs={2}
      className={className}
      panelManagerId={panelManagerId}
      globalPanelIds={['quickGenerate', 'info']}
      panelRegistryOverrides={{
        quickGenerate: { title: 'Generate' },
        info: { title: 'Metadata' },
      }}
      onReady={handleReady}
      enableContextMenu
    />
  );
}
