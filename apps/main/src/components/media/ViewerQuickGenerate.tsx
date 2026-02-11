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
 * Uses QuickGenPanelHost with GenerationScopeProvider for scoped panel layout.
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
  GenerationScopeProvider,
  GenerationSourceToggle,
  ViewerAssetInputProvider,
  QuickGenPanelHost,
  useProvideGenerationWidget,
  useQuickGenPanelLayout,
  useGenerationSettingsStore,
} from '@features/generation';

import type { OperationType } from '@/types/operations';



const VIEWER_SCOPE_ID = 'viewerQuickGenerate';

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
 * Inner component for the expanded quick generate content.
 * Rendered inside the viewer scope to access scoped stores.
 */
function ViewerQuickGenerateChrome({
  asset,
  alwaysExpanded,
  onCollapse,
  controlCenterOpen,
  mode,
  onModeChange,
}: {
  asset: ViewerAsset;
  alwaysExpanded: boolean;
  onCollapse: () => void;
  controlCenterOpen: boolean;
  mode: GenerationSourceMode;
  onModeChange: (mode: GenerationSourceMode) => void;
}) {
  // Read source context for loading/info display (mode comes from prop, not capability)
  const { value: sourceContext } = useCapability<GenerationSourceContext>(CAP_GENERATION_SOURCE);
  const loading = sourceContext?.loading ?? false;
  const sourceGeneration = sourceContext?.sourceGeneration;

  const setOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        onCollapse();
      }
    },
    [onCollapse],
  );

  // Centralized widget provision: controller + scoped stores + CAP_GENERATION_WIDGET
  const { setOperationType, setDynamicParams } = useProvideGenerationWidget({
    widgetId: 'viewerQuickGenerate',
    label: 'Viewer Quick Generate',
    priority: 45,
    isOpen: true,
    setOpen,
  });

  // Check if auto-switch is enabled (defaults to true)
  const autoSwitchEnabled = useGenerationSettingsStore(
    (s) => s.params.autoSwitchOperationType ?? true
  );

  // Auto-set operation type based on asset type (when in user mode and enabled)
  useEffect(() => {
    if (mode === 'user' && autoSwitchEnabled) {
      const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
      setOperationType(targetOp);
    }
  }, [asset.type, setOperationType, mode, autoSwitchEnabled]);

  // Auto-set dynamic params from viewed asset
  useEffect(() => {
    if (!asset.id) return;
    setDynamicParams((prev: Record<string, unknown>) => {
      const next = { ...prev };
      delete next.video_url;
      delete next.image_url;
      next.source_asset_id = asset.id;
      return next;
    });
  }, [asset.id, asset.type, setDynamicParams]);

  return (
    <div className="space-y-2">
      {/* Header with mode toggle and close button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Quick Generate
        </span>
        <div className="flex items-center gap-2">
          {/* Mode toggle - provides CAP_GENERATION_SOURCE */}
          <GenerationSourceToggle
            mode={mode}
            sourceGenerationId={asset.sourceGenerationId}
            onModeChange={onModeChange}
          />
          {!alwaysExpanded && (
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
              title="Close"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

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

/**
 * Inner component for the expanded quick generate content.
 * Rendered inside GenerationScopeProvider to access scoped stores.
 */
function ViewerQuickGenerateContent({
  asset,
  alwaysExpanded,
  onCollapse,
  controlCenterOpen,
  mode,
  onModeChange,
}: {
  asset: ViewerAsset;
  alwaysExpanded: boolean;
  onCollapse: () => void;
  controlCenterOpen: boolean;
  mode: GenerationSourceMode;
  onModeChange: (mode: GenerationSourceMode) => void;
}) {
  // Centralized panel layout: panels, defaultLayout, resolvePanelPosition
  const layout = useQuickGenPanelLayout({ showBlocks: false });

  const layoutVersion = layout.operationType === 'video_transition' ? 'v7' : 'v6';
  const storageKey = layout.supportsInputs
    ? `viewer-quickgen-layout-${layoutVersion}:${layout.operationType}:with-asset`
    : `viewer-quickgen-layout-${layoutVersion}:${layout.operationType}:no-asset`;

  return (
    <>
      <ViewerQuickGenerateChrome
        asset={asset}
        alwaysExpanded={alwaysExpanded}
        onCollapse={onCollapse}
        controlCenterOpen={controlCenterOpen}
        mode={mode}
        onModeChange={onModeChange}
      />
      <QuickGenPanelHost
        key={storageKey}
        panels={layout.panels}
        storageKey={storageKey}
        panelManagerId="viewerQuickGenerate"
        context={{ targetProviderId: 'generation-widget:viewerQuickGenerate', sourceLabel: 'Viewer' }}
        defaultLayout={layout.defaultLayout}
        resolvePanelPosition={layout.resolvePanelPosition}
        className="h-[360px] min-h-[280px] mt-2"
        minPanelsForTabs={2}
      />
    </>
  );
}

export function ViewerQuickGenerate({ asset, alwaysExpanded = false }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded);
  // Mode is managed at top level to determine scope before rendering the toggle
  const [mode, setMode] = useState<GenerationSourceMode>('user');

  // Reset mode when asset changes
  useEffect(() => {
    // If switching to an asset without source generation while in asset mode, reset to user
    if (mode === 'asset' && !asset.sourceGenerationId) {
      setMode('user');
    }
  }, [asset.id, asset.sourceGenerationId, mode]);

  // Always use isolated viewer scope - mode only affects initial values, not scope
  const scopeId = VIEWER_SCOPE_ID;

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

  // Expanded state - show panel host with viewer scope
  return (
    <GenerationScopeProvider scopeId={scopeId} label="Viewer Generation">
      <ViewerQuickGenerateContent
        asset={asset}
        alwaysExpanded={alwaysExpanded}
        onCollapse={() => setIsExpanded(false)}
        controlCenterOpen={controlCenterOpen}
        mode={mode}
        onModeChange={setMode}
      />
    </GenerationScopeProvider>
  );
}
