/**
 * AssetViewerDockview
 *
 * Dockview-based asset viewer with resizable, rearrangeable panels.
 * Uses PanelHostDockview for smart tab visibility (tabs shown only when grouped).
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

import type { DockviewApi } from 'dockview-core';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

import {
  getDockviewGroupCount,
  getDockviewGroups,
  getDockviewPanels,
  type DockviewHost,
} from '@lib/dockview';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import type { ViewerAsset } from '@features/assets';
import {
  PanelHostDockview,
  usePanelCatalogBootstrap,
  type PanelHostDockviewRef,
} from '@features/panels';
import { DOCK_IDS } from '@features/panels/lib/panelIds';
import { useAppDockviewIntegration } from '@features/workspace';

import type { ViewerSettings } from './types';

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

function arePanelDefinitionsRegistered(panelIds: readonly string[]): boolean {
  return panelIds.every((panelId) => panelSelectors.has(panelId));
}

/**
 * Create the default panel layout for asset viewer.
 * Media preview takes top 75%, generate/metadata tabs below.
 */
function createDefaultLayout(
  api: DockviewApi,
  options?: {
    excludePanelIds?: ReadonlySet<string>;
    availablePanelIds?: ReadonlySet<string>;
  }
) {
  const excludePanelIds = options?.excludePanelIds;
  const availablePanelIds = options?.availablePanelIds;
  const shouldInclude = (panelId: string) =>
    !excludePanelIds?.has(panelId) && (!availablePanelIds || availablePanelIds.has(panelId));
  const hasMediaPreview = shouldInclude('media-preview');
  const hasQuickGenerate = shouldInclude('quickGenerate');
  const willAddQuickGenerate = hasQuickGenerate && hasMediaPreview;

  // Media panel takes the top area
  if (hasMediaPreview) {
    api.addPanel({
      id: 'media-preview',
      component: 'media-preview',
      title: 'Preview',
    });
  }

  if (willAddQuickGenerate) {
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
  }

  if (shouldInclude('info')) {
    const infoPosition = willAddQuickGenerate
      ? { referencePanel: 'quickGenerate' as const }
      : hasMediaPreview
        ? {
            direction: 'below' as const,
            referencePanel: 'media-preview',
          }
        : undefined;

    // Info panel as tab with quickGenerate when present, otherwise below preview
    api.addPanel({
      id: 'info',
      component: 'info',
      title: 'Metadata',
      position: infoPosition,
    });
  }

  // Set initial sizes - media gets 75% of height
  try {
    const groups = getDockviewGroups(api);
    const groupCount = getDockviewGroupCount(api, groups);
    if (groupCount >= 2) {
      const viewportHeight = window.innerHeight;
      const mediaHeight = Math.floor(viewportHeight * 0.75);
      api.getGroup(groups[0].id)?.api.setSize({ height: mediaHeight });
    }
  } catch (e) {
    console.warn('[AssetViewerDockview] Failed to set initial sizes:', e);
  }
}

function ensureViewerPreviewPanel(api: DockviewApi) {
  if (api.getPanel('media-preview')) return;

  const existingPanels = getDockviewPanels(api).filter((panel) => panel?.id !== 'media-preview');
  const referencePanelId =
    typeof existingPanels[0]?.id === 'string' ? existingPanels[0].id : undefined;

  api.addPanel({
    id: 'media-preview',
    component: 'media-preview',
    title: 'Preview',
    position: referencePanelId
      ? {
          direction: 'above',
          referencePanel: referencePanelId,
        }
      : undefined,
  });
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
  const { catalogVersion, initializationComplete } = usePanelCatalogBootstrap({
    contexts: [DOCK_IDS.assetViewer],
    onInitializeError: (error) => {
      console.error('[AssetViewerDockview] Failed to initialize asset-viewer panels:', error);
    },
  });
  const scopedPanelIds = useMemo(
    () => panelSelectors.getIdsForScope(DOCK_IDS.assetViewer),
    [catalogVersion],
  );
  const defaultPanelsRegistered = arePanelDefinitionsRegistered(DEFAULT_VIEWER_PANEL_IDS);
  const panelsReady = defaultPanelsRegistered;
  const showLoadingPlaceholder = !initializationComplete && !defaultPanelsRegistered;

  const viewerPanelIds = useMemo(
    () => {
      if (!panelsReady) {
        return [];
      }
      const merged = new Set<string>(DEFAULT_VIEWER_PANEL_IDS);
      for (const panelId of scopedPanelIds) {
        merged.add(panelId);
      }
      return Array.from(merged).filter((panelId) => panelSelectors.has(panelId));
    },
    [panelsReady, scopedPanelIds]
  );
  const viewerPanelIdSet = useMemo(() => new Set(viewerPanelIds), [viewerPanelIds]);
  const resolvedDockviewId = panelManagerId ?? DOCK_IDS.assetViewer;
  const {
    capabilities: dockCapabilities,
    floatingPanelDefinitionIdSet: floatingPanelDefinitionIds,
    placementExclusions: floatingViewerPanelIds,
  } = useAppDockviewIntegration(resolvedDockviewId, viewerPanelIds);
  const useDockId = initializationComplete && scopedPanelIds.length > 0;
  const viewerDefaultLayout = useCallback(
    (api: DockviewApi) =>
      createDefaultLayout(api, {
        excludePanelIds: floatingPanelDefinitionIds,
        availablePanelIds: viewerPanelIdSet,
      }),
    [floatingPanelDefinitionIds, viewerPanelIdSet]
  );

  // Use ref for dockviewApi to avoid context recreation when API is set
  // Components can access it via context.dockviewApiRef.current
  const dockviewApiRef = useRef<DockviewApi | undefined>(undefined);
  const dockviewHostRef = useRef<DockviewHost | null>(null);
  const panelHostRef = useRef<PanelHostDockviewRef>(null);
  // Keep state for triggering re-renders when needed (but not in context deps)
  const [dockviewApiVersion, setDockviewApiVersion] = useState(0);

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
      dockviewHost: dockviewHostRef.current,
      dockviewHostRef,
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
    dockviewHostRef.current = panelHostRef.current?.getHost() ?? null;
    setDockviewApiVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const api = dockviewApiRef.current;
    if (!api) return;

    const canRestorePreview =
      viewerPanelIds.includes('media-preview') &&
      !floatingViewerPanelIds.includes('media-preview');

    if (!canRestorePreview) return;

    const scheduleEnsurePreview = () => {
      requestAnimationFrame(() => {
        const currentApi = dockviewApiRef.current;
        if (!currentApi) return;
        if (floatingViewerPanelIds.includes('media-preview')) return;
        ensureViewerPreviewPanel(currentApi);
      });
    };

    scheduleEnsurePreview();

    const removeDisposable = api.onDidRemovePanel(scheduleEnsurePreview);
    const layoutDisposable =
      typeof (api as any).onDidLayoutFromJSON === 'function'
        ? (api as any).onDidLayoutFromJSON(scheduleEnsurePreview)
        : null;

    return () => {
      removeDisposable.dispose();
      layoutDisposable?.dispose?.();
    };
  }, [dockviewApiVersion, viewerPanelIds, floatingViewerPanelIds]);

  if (showLoadingPlaceholder) {
    return <div className={className ?? "h-full w-full"} />;
  }

  return (
    <PanelHostDockview
      ref={panelHostRef}
      panels={useDockId ? undefined : viewerPanelIds}
      dockId={useDockId ? DOCK_IDS.assetViewer : undefined}
      excludePanels={useDockId ? floatingViewerPanelIds : undefined}
      storageKey="dockview:asset-viewer:v5"
      excludeFromLayout={floatingViewerPanelIds}
      context={context}
      defaultPanelScopes={['generation']}
      defaultLayout={viewerDefaultLayout}
      minPanelsForTabs={2}
      className={className}
      panelManagerId={panelManagerId}
      onReady={handleReady}
      enableContextMenu
      capabilities={dockCapabilities}
      resolvePanelTitle={(panelId) => panelSelectors.get(panelId)?.title ?? panelId}
    />
  );
}
