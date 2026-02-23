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

import { Ref } from '@pixsim7/shared.types';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { Icon } from '@lib/icons';

import type { ViewerAsset } from '@features/assets';
import {
  CAP_GENERATION_CONTEXT,
  useProvideCapability,
  useCapability,
  CAP_GENERATION_SOURCE,
  type GenerationContextSummary,
  type GenerationSourceMode,
  type GenerationSourceContext,
} from '@features/contextHub';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import {
  ViewerAssetInputProvider,
  QuickGenWidget,
  useGenerationSettingsStore,
  type QuickGenWidgetRenderContext,
} from '@features/generation';

import type { OperationType } from '@/types/operations';

// Tracks last asset ID seen by auto-switch logic.
// Survives component unmount/remount (gallery navigation) but resets on page refresh.
let _lastViewerAssetId: string | number | undefined;

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
 * Inner component that provides CAP_GENERATION_CONTEXT based on source mode.
 */
function ViewerGenerationContextProvider({
  asset,
  controlCenterOpen,
}: {
  asset: ViewerAsset;
  controlCenterOpen: boolean;
}) {
  const { value: sourceContext } = useCapability<GenerationSourceContext>(CAP_GENERATION_SOURCE);
  const mode = sourceContext?.mode ?? 'user';
  const sourceGeneration = sourceContext?.sourceGeneration;

  const generationContextValue = useMemo<GenerationContextSummary>(() => {
    const generationId =
      mode === 'asset' ? (sourceGeneration?.id ?? asset.sourceGenerationId) : null;
    const ref =
      generationId != null && Number.isFinite(Number(generationId))
        ? Ref.generation(Number(generationId))
        : null;

    return {
      id: 'assetViewer',
      label: 'Asset Viewer',
      mode: mode === 'asset' ? 'asset' : 'controlCenter',
      supportsMultiAsset: false,
      ref,
    };
  }, [mode, sourceGeneration?.id, asset.sourceGenerationId]);

  const generationContextProvider = useMemo(
    () => ({
      id: 'generation:assetViewer',
      label: 'Asset Viewer',
      priority: 40,
      exposeToContextMenu: true,
      isAvailable: () => !controlCenterOpen,
      getValue: () => generationContextValue,
    }),
    [controlCenterOpen, generationContextValue]
  );

  useProvideCapability(
    CAP_GENERATION_CONTEXT,
    generationContextProvider,
    [generationContextValue, controlCenterOpen],
    { scope: 'root' }
  );

  return null;
}

/**
 * Chrome rendered above the panel host inside the widget.
 * Receives setOperationType/setDynamicParams from the widget's render context.
 */
function ViewerQuickGenerateChrome({
  asset,
  alwaysExpanded,
  onCollapse,
  controlCenterOpen,
  mode,
  ctx,
}: {
  asset: ViewerAsset;
  alwaysExpanded: boolean;
  onCollapse: () => void;
  controlCenterOpen: boolean;
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
    if (_lastViewerAssetId === undefined) {
      // First mount after refresh — just record, don't auto-switch
      _lastViewerAssetId = asset.id;
      return;
    }
    if (_lastViewerAssetId === asset.id) return;
    _lastViewerAssetId = asset.id;

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
      <ViewerGenerationContextProvider asset={asset} controlCenterOpen={controlCenterOpen} />
    </div>
  );
}

export function ViewerQuickGenerate({ asset, alwaysExpanded = false }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
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
      provideContext={false}
      storageKeyPrefix="viewer-quickgen"
      className=""
      panelHostClassName="h-[360px] min-h-[280px] mt-2"
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
          controlCenterOpen={controlCenterOpen}
          mode={mode}
          ctx={ctx}
        />
      )}
    </QuickGenWidget>
  );
}
