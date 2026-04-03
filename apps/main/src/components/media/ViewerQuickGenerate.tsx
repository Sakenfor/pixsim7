/**
 * ViewerQuickGenerate
 *
 * Compact inline generation panel for the asset viewer.
 * Shows when control center is closed, providing full generation settings
 * for the currently viewed asset without needing to open Control Center.
 *
 * Supports two modes via GenerationSourceToggle:
 * - "user": Uses current user settings from Control Center (global scope)
 * - "asset": Uses original generation settings from the asset (isolated scope)
 *
 * Uses QuickGenWidget for scoped panel layout and widget provision.
 * Chrome components (GenerationSourceToggle, ViewerAssetInputProvider) provide capabilities.
 */

import { useState, useEffect, useCallback } from 'react';

import { Icon } from '@lib/icons';
import { hmrSingleton } from '@lib/utils';

import type { ViewerAsset } from '@features/assets';
import {
  useCapability,
  CAP_GENERATION_SOURCE,
  type GenerationSourceMode,
  type GenerationSourceContext,
} from '@features/contextHub';
import { useDockState } from '@features/docks/stores';
import {
  ViewerAssetInputProvider,
  QuickGenWidget,
  useGenerationSettingsStore,
  type QuickGenWidgetRenderContext,
} from '@features/generation';
import { DOCK_IDS } from '@features/panels/lib/panelIds';

import type { OperationType } from '@/types/operations';


// Tracks last asset ID seen by auto-switch logic.
// Survives component unmount/remount (gallery navigation) and HMR.
const _viewerState = hmrSingleton('viewerQuickGenerate', () => ({
  lastAssetId: undefined as string | number | undefined,
}));
function getLastViewerAssetId(): string | number | undefined {
  return _viewerState.lastAssetId;
}
function setLastViewerAssetId(id: string | number | undefined) {
  _viewerState.lastAssetId = id;
}

const VIEWER_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings'] as const;

function getViewerBackendAssetId(asset: ViewerAsset): number | null {
  const metadataAssetId = asset.metadata?.assetId;
  if (typeof metadataAssetId === 'number' && Number.isFinite(metadataAssetId) && metadataAssetId > 0) {
    return metadataAssetId;
  }

  const directId = Number(asset.id);
  if (Number.isFinite(directId) && directId > 0) {
    return directId;
  }

  return null;
}

interface ViewerQuickGenerateProps {
  asset: ViewerAsset;
  /** When true, always show expanded state (no collapse button) */
  alwaysExpanded?: boolean;
}

/**
 * Chrome rendered above the panel host inside the widget.
 * Receives setOperationType/setDynamicParams from the widget's render context.
 */
function ViewerQuickGenerateChrome({
  asset,
  alwaysExpanded,
  onCollapse,
  mode,
  ctx,
}: {
  asset: ViewerAsset;
  alwaysExpanded: boolean;
  onCollapse: () => void;
  mode: GenerationSourceMode;
  ctx: QuickGenWidgetRenderContext;
}) {
  // Read source context for loading/info display (mode comes from prop, not capability)
  const { value: sourceContext } = useCapability<GenerationSourceContext>(CAP_GENERATION_SOURCE);
  const loading = sourceContext?.loading ?? false;
  const sourceGeneration = sourceContext?.sourceGeneration;

  // Check if auto-switch is enabled (defaults to true)
  const autoSwitchEnabled = useGenerationSettingsStore(
    (s) => s.params.autoSwitchOperationType ?? true
  );

  // Auto-switch operation type when navigating to a different asset.
  // Uses module-level var so it survives unmount/remount (gallery click)
  // but resets on page refresh (preserving persisted operation type).
  useEffect(() => {
    if (getLastViewerAssetId() === undefined) {
      // First mount after refresh — just record, don't auto-switch
      setLastViewerAssetId(asset.id);
      return;
    }
    if (getLastViewerAssetId() === asset.id) return;
    setLastViewerAssetId(asset.id);

    if (mode !== 'user' || !autoSwitchEnabled) return;

    const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
    ctx.setOperationType(targetOp);
  }, [asset.id, asset.type, ctx.setOperationType, mode, autoSwitchEnabled]);

  // Auto-set dynamic params from viewed asset (only gallery assets have valid backend IDs)
  useEffect(() => {
    if (!asset.id) return;
    ctx.setDynamicParams((prev: Record<string, unknown>) => {
      const next = { ...prev };
      delete next.video_url;
      delete next.image_url;
      const backendAssetId = getViewerBackendAssetId(asset);
      if (backendAssetId != null) {
        next.source_asset_id = backendAssetId;
      } else {
        delete next.source_asset_id;
      }
      return next;
    });
  }, [asset.id, asset.metadata?.assetId, asset.type, asset.source, ctx.setDynamicParams]);

  return (
    <div className="space-y-2">
      {/* Header with close button */}
      {!alwaysExpanded && (
        <div className="flex items-center justify-end">
          <button
            onClick={onCollapse}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
            title="Close"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Loading indicator for asset mode */}
      {mode === 'asset' && loading && (
        <div className="flex items-center justify-center py-2 text-neutral-500">
          <Icon name="loader" size={14} className="animate-spin mr-2" />
          <span className="text-xs">Loading generation settings...</span>
        </div>
      )}

      {/* Asset generation info */}
      {mode === 'asset' && sourceGeneration && !loading && (
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 px-1">
          Original: {sourceGeneration.providerId} x {sourceGeneration.operationType}
        </div>
      )}

      {/* Chrome: capability providers */}
      <ViewerAssetInputProvider asset={asset} />
    </div>
  );
}

export function ViewerQuickGenerate({ asset, alwaysExpanded = false }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useDockState(DOCK_IDS.controlCenter, (dock) => dock.open);
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded);
  // Mode is managed at top level to determine scope before rendering the toggle
  const [mode, setMode] = useState<GenerationSourceMode>('user');

  // Reset mode when asset changes
  useEffect(() => {
    // If switching to an asset without generation context while in asset mode, reset to user
    if (mode === 'asset' && !asset.sourceGenerationId && !asset.hasGenerationContext) {
      setMode('user');
    }
  }, [asset.id, asset.sourceGenerationId, asset.hasGenerationContext, mode]);

  const setOpen = useCallback(
    (open: boolean) => {
      if (!open) setIsExpanded(false);
    },
    [],
  );

  const shouldHide = controlCenterOpen && !alwaysExpanded;

  // Don't show if control center is open (unless forced via alwaysExpanded)
  if (shouldHide) {
    return null;
  }

  // Collapsed state - just show icon button (skip if alwaysExpanded)
  if (!isExpanded && !alwaysExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full px-3 py-2 text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors flex items-center justify-center"
        title="Quick Generate"
      >
        <Icon name="sparkles" size={16} />
      </button>
    );
  }

  // Expanded state — QuickGenWidget handles scope sync, scope provider, widget provision, layout
  return (
    <QuickGenWidget
      widgetId="viewerQuickGenerate"
      label="Viewer Quick Generate"
      panelManagerId="viewerQuickGenerate"
      panelIds={VIEWER_PANEL_IDS}
      priority={45}
      isOpen={true}
      setOpen={setOpen}
      contextExposure="active"
      storageKeyPrefix="viewer-quickgen"
      className={alwaysExpanded ? 'h-full flex flex-col' : ''}
      panelHostClassName={alwaysExpanded ? 'flex-1 min-h-0 mt-2' : 'h-[360px] min-h-[280px] mt-2'}
      context={{
        sourceToggleMode: mode,
        sourceToggleGenerationId: asset.sourceGenerationId,
        onSourceToggleModeChange: setMode,
      }}
      minPanelsForTabs={2}
    >
      {(ctx) => (
        <ViewerQuickGenerateChrome
          asset={asset}
          alwaysExpanded={alwaysExpanded}
          onCollapse={() => setIsExpanded(false)}
          mode={mode}
          ctx={ctx}
        />
      )}
    </QuickGenWidget>
  );
}
