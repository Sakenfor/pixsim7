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

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { DockviewApi } from 'dockview-core';
import { SmartDockview } from '@lib/dockview';
import type { ViewerSettings } from './types';
import type { ViewerAsset } from '@features/assets';
import type { PanelDefinition } from '@features/panels';
import { getPanelIdsForScope, panelRegistry } from '@features/panels';

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

// Default panels for the viewer layout (additional panels are discovered via registry)
const DEFAULT_VIEWER_PANEL_IDS = [
  'media-preview',
  'quickGenerate',
  'info',
  'interactive-surface',
] as const;

/**
 * Create the default panel layout for asset viewer.
 * Media preview takes top 75%, generate/metadata tabs below.
 */
function createDefaultLayout(api: DockviewApi, panelDefs: PanelDefinition[]) {
  // Media panel takes the top area
  api.addPanel({
    id: 'media-preview',
    component: 'media-preview',
    title: 'Preview',
  });

  // Quick generate panel below media
  api.addPanel({
    id: 'quickGenerate',
    component: 'quickGenerate',
    title: 'Generate',
    position: {
      direction: 'below',
      referencePanel: 'media-preview',
    },
  });

  // Info panel as tab with quickGenerate
  api.addPanel({
    id: 'info',
    component: 'info',
    title: 'Metadata',
    position: {
      referencePanel: 'quickGenerate',
    },
  });

  // Set initial sizes - media gets 75% of height
  try {
    const groups = api.groups;
    if (groups.length >= 2) {
      const viewportHeight = window.innerHeight;
      const mediaHeight = Math.floor(viewportHeight * 0.75);
      api.getGroup(groups[0].id)?.api.setSize({ height: mediaHeight });
    }
  } catch (e) {
    console.warn('[AssetViewerDockview] Failed to set initial sizes:', e);
  }
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
  const [viewerPanelIds, setViewerPanelIds] = useState<string[]>(() => {
    const ids = getPanelIdsForScope('asset-viewer');
    return ids.length > 0 ? ids : [...DEFAULT_VIEWER_PANEL_IDS];
  });

  useEffect(() => {
    return panelRegistry.subscribe(() => {
      const ids = getPanelIdsForScope('asset-viewer');
      setViewerPanelIds(ids.length > 0 ? ids : [...DEFAULT_VIEWER_PANEL_IDS]);
    });
  }, []);

  // Use ref for dockviewApi to avoid context recreation when API is set
  // Components can access it via context.dockviewApiRef.current
  const dockviewApiRef = useRef<DockviewApi | undefined>(undefined);
  // Keep state for triggering re-renders when needed (but not in context deps)
  const [, setDockviewApiVersion] = useState(0);

  // Build context for panels (includes both ViewerPanelContext and WorkspaceContext fields)
  // Note: dockviewApi is provided via ref to avoid context changes on initial setup
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
      dockviewApi: dockviewApiRef.current,
      dockviewApiRef,
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
      // Note: dockviewApiRef is intentionally NOT a dependency - it's a stable ref
    ]
  );

  // Capture dockview API when ready
  const handleReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;
    setDockviewApiVersion((v) => v + 1);
  }, []);

  return (
    <SmartDockview
      panels={viewerPanelIds}
      storageKey="dockview:asset-viewer:v5"
      context={context}
      defaultPanelScopes={['generation']}
      defaultLayout={createDefaultLayout}
      minPanelsForTabs={2}
      className={className}
      panelManagerId={panelManagerId}
      onReady={handleReady}
      enableContextMenu
    />
  );
}
