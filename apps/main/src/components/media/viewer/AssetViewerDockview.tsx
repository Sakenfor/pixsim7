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
import { filterPanelsByPrefs } from '@features/docks';
import { useDockPanelPrefs } from '@features/docks/stores';
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
  'recent-strip',
  'quickGenerate',
  'info',
] as const;
const REQUIRED_VIEWER_PANEL_IDS = ['media-preview'] as const;

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
  const hasRecentStrip = shouldInclude('recent-strip');
  const willAddQuickGenerate = hasQuickGenerate && hasMediaPreview;
  const willAddRecentStrip = hasRecentStrip && hasMediaPreview;

  // Media panel takes the top area
  if (hasMediaPreview) {
    api.addPanel({
      id: 'media-preview',
      component: 'media-preview',
      title: 'Preview',
    });
  }

  if (willAddRecentStrip) {
    api.addPanel({
      id: 'recent-strip',
      component: 'recent-strip',
      title: 'Recent',
      position: {
        direction: 'below',
        referencePanel: 'media-preview',
      },
    });
  }

  if (willAddQuickGenerate) {
    // Quick generate panel below the recent strip (or directly below media
    // preview when the strip is excluded from the layout).
    const quickGenReference = willAddRecentStrip ? 'recent-strip' : 'media-preview';
    api.addPanel({
      id: 'quickGenerate',
      component: 'quickGenerate',
      title: 'Generate',
      position: {
        direction: 'below',
        referencePanel: quickGenReference,
      },
    });
  }

  if (shouldInclude('info')) {
    const infoPosition = willAddQuickGenerate
      ? { referencePanel: 'quickGenerate' as const }
      : willAddRecentStrip
        ? { direction: 'below' as const, referencePanel: 'recent-strip' }
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

  // Set initial sizes - media gets ~70% of height, recent strip gets ~96px.
  try {
    const groups = getDockviewGroups(api);
    const groupCount = getDockviewGroupCount(api, groups);
    if (groupCount >= 2) {
      const viewportHeight = window.innerHeight;
      const mediaHeight = Math.floor(viewportHeight * 0.7);
      api.getGroup(groups[0].id)?.api.setSize({ height: mediaHeight });
    }
    if (willAddRecentStrip) {
      const stripPanel = api.getPanel('recent-strip');
      stripPanel?.group?.api.setSize({ height: 96 });
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
  const panelPrefs = useDockPanelPrefs(DOCK_IDS.assetViewer, (prefs) => prefs);
  const { catalogVersion, initializationComplete } = usePanelCatalogBootstrap({
    contexts: [DOCK_IDS.assetViewer],
    onInitializeError: (error) => {
      console.error('[AssetViewerDockview] Failed to initialize asset-viewer panels:', error);
    },
  });
  const scopedPanels = useMemo(
    () => panelSelectors.getPanelsForScope(DOCK_IDS.assetViewer),
    [catalogVersion],
  );
  const enabledScopedPanels = useMemo(
    () => filterPanelsByPrefs(scopedPanels, panelPrefs),
    [scopedPanels, panelPrefs],
  );
  const scopedPanelIds = useMemo(
    () => enabledScopedPanels.map((panel) => panel.id),
    [enabledScopedPanels],
  );
  const scopedPanelIdSet = useMemo(() => new Set(scopedPanelIds), [scopedPanelIds]);
  const defaultPanelsRegistered = arePanelDefinitionsRegistered(DEFAULT_VIEWER_PANEL_IDS);
  const panelsReady = defaultPanelsRegistered;
  const showLoadingPlaceholder = !initializationComplete && !defaultPanelsRegistered;

  const viewerPanelIds = useMemo(
    () => {
      if (!panelsReady) {
        return [];
      }

      // Only include required + default panels. Additional scoped panels
      // (e.g. asset-tags, interactive-surface) are available via context menu
      // but not forced into the layout.
      const merged = new Set<string>();
      for (const panelId of REQUIRED_VIEWER_PANEL_IDS) {
        if (panelSelectors.has(panelId)) {
          merged.add(panelId);
        }
      }
      for (const panelId of DEFAULT_VIEWER_PANEL_IDS) {
        if (scopedPanelIdSet.has(panelId) && panelSelectors.has(panelId)) {
          merged.add(panelId);
        }
      }
      return Array.from(merged);
    },
    [panelsReady, scopedPanelIds, scopedPanelIdSet]
  );
  const viewerPanelIdSet = useMemo(() => new Set(viewerPanelIds), [viewerPanelIds]);
  const resolvedDockviewId = panelManagerId ?? DOCK_IDS.assetViewer;
  const {
    capabilities: dockCapabilities,
    placementExclusions: floatingViewerPanelIds,
  } = useAppDockviewIntegration(resolvedDockviewId, viewerPanelIds);
  const useDockId = initializationComplete && scopedPanelIds.length > 0;
  const viewerDefaultLayout = useCallback(
    (api: DockviewApi) =>
      createDefaultLayout(api, {
        excludePanelIds: new Set(floatingViewerPanelIds),
        availablePanelIds: viewerPanelIdSet,
      }),
    [floatingViewerPanelIds, viewerPanelIdSet]
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
      allowedPanels={useDockId ? viewerPanelIds : undefined}
      excludePanels={useDockId ? floatingViewerPanelIds : undefined}
      storageKey="dockview:asset-viewer:v6"
      excludeFromLayout={floatingViewerPanelIds}
      context={context}
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
