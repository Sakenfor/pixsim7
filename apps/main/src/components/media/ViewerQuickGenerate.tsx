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
 * Uses QuickGenWidget for portable panel layout with scoped stores.
 * Chrome components (GenerationSourceToggle, ViewerAssetInputProvider) provide capabilities.
 */

import { Icon } from '@lib/icons';
import { Ref } from '@pixsim7/shared.types';
import { useState, useEffect, useMemo } from 'react';

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
  GenerationSourceToggle,
  ViewerAssetInputProvider,
  QuickGenWidget,
  QUICKGEN_PRESETS,
} from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';

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
 * Rendered inside QuickGenWidget to access scoped stores.
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

  // Control Center controller (reads from current scope)
  const controller = useQuickGenerateController();
  const { setOperationType, setDynamicParams } = controller;

  // Auto-set operation type based on asset type (when in user mode)
  useEffect(() => {
    if (mode === 'user') {
      const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
      setOperationType(targetOp);
    }
  }, [asset.type, setOperationType, mode]);

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
 * Rendered inside QuickGenWidget to access scoped stores.
 */
function ViewerQuickGenerateContent({
  asset,
  alwaysExpanded,
  onCollapse,
  controlCenterOpen,
  mode,
  onModeChange,
  scopeId,
}: {
  asset: ViewerAsset;
  alwaysExpanded: boolean;
  onCollapse: () => void;
  controlCenterOpen: boolean;
  mode: GenerationSourceMode;
  onModeChange: (mode: GenerationSourceMode) => void;
  scopeId: string;
}) {
  return (
    <QuickGenWidget
      scopeId={scopeId}
      scopeLabel="Viewer Generation"
      panels={QUICKGEN_PRESETS.promptSettings}
      storageKey="viewer-quickgen-layout-v4"
      panelManagerId="viewerQuickGenerate"
      className="h-[360px] min-h-[280px] mt-2"
      chrome={
        <ViewerQuickGenerateChrome
          asset={asset}
          alwaysExpanded={alwaysExpanded}
          onCollapse={onCollapse}
          controlCenterOpen={controlCenterOpen}
          mode={mode}
          onModeChange={onModeChange}
        />
      }
    />
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

  // Determine scope based on mode:
  // - asset mode: use isolated viewer scope (populated with asset's generation data)
  // - user mode: use global scope (shared with Control Center)
  const scopeId = mode === 'asset' ? VIEWER_SCOPE_ID : 'global';

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

  // Expanded state - show panel host with QuickGenWidget
  return (
    <ViewerQuickGenerateContent
      asset={asset}
      alwaysExpanded={alwaysExpanded}
      onCollapse={() => setIsExpanded(false)}
      controlCenterOpen={controlCenterOpen}
      mode={mode}
      onModeChange={setMode}
      scopeId={scopeId}
    />
  );
}
