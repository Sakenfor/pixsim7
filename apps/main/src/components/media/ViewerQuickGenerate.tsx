/**
 * ViewerQuickGenerate
 *
 * Compact inline generation panel for the asset viewer.
 * Shows when control center is closed, providing full generation settings
 * for the currently viewed asset without needing to open Control Center.
 *
 * Supports two modes:
 * - "asset": Shows the original prompt/settings from the asset's source generation
 * - "controlCenter": Shows the main Control Center settings (default behavior)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { SmartDockview, createLocalPanelRegistry } from '@lib/dockview';
import { useQuickGenerateController } from '@features/prompts';
import { Icon } from '@lib/icons';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';
import { useGenerationWorkbench, fromGenerationResponse, type GenerationModel } from '@features/generation';
import { getGeneration } from '@lib/api/generations';
import type { ViewerAsset } from '@features/assets';
import type { OperationType } from '@/types/operations';
import {
  CAP_GENERATION_CONTEXT,
  useProvideCapability,
  type GenerationContextSummary,
} from '@features/contextHub';
import { Ref } from '@pixsim7/shared.types';
import {
  ViewerQuickGenPromptPanel,
  ViewerQuickGenSettingsPanel,
  type ViewerQuickGenContext,
  type ViewerQuickGenSettingsMode,
} from './viewer/ViewerQuickGeneratePanels';
import type { DockviewApi } from 'dockview-core';

type SettingsMode = 'asset' | 'controlCenter';

interface ViewerQuickGenerateProps {
  asset: ViewerAsset;
  /** When true, always show expanded state (no collapse button) */
  alwaysExpanded?: boolean;
}

export function ViewerQuickGenerate({ asset, alwaysExpanded = false }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
  const [isExpanded, setIsExpanded] = useState(alwaysExpanded);
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('controlCenter');

  // Asset settings state (local, ephemeral)
  const [assetGeneration, setAssetGeneration] = useState<GenerationModel | null>(null);
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);

  // Control Center controller
  const {
    generating,
    generate: ccGenerate,
    operationType: ccOperationType,
    setOperationType: ccSetOperationType,
    prompt: ccPrompt,
    setPrompt: ccSetPrompt,
    error: ccError,
    providerId: ccProviderId,
    dynamicParams,
    setDynamicParams,
    setProvider: ccSetProvider,
    setPresetParams: ccSetPresetParams,
  } = useQuickGenerateController();

  // Get paramSpecs for per-model prompt limits
  const workbench = useGenerationWorkbench({ operationType: ccOperationType });

  const hasSourceGeneration = !!asset.sourceGenerationId;

  // Fetch generation data when switching to asset mode or when asset changes
  const fetchAssetGeneration = useCallback(async () => {
    if (!asset.sourceGenerationId) return;

    setAssetLoading(true);
    setAssetError(null);

    try {
      const response = await getGeneration(asset.sourceGenerationId);
      const generation = fromGenerationResponse(response);
      setAssetGeneration(generation);
      setAssetPrompt(generation.finalPrompt || '');
    } catch (err) {
      console.error('Failed to fetch generation:', err);
      setAssetError('Failed to load generation settings');
      setAssetGeneration(null);
    } finally {
      setAssetLoading(false);
    }
  }, [asset.sourceGenerationId]);

  // Fetch generation when entering asset mode
  useEffect(() => {
    if (settingsMode === 'asset' && hasSourceGeneration && !assetGeneration) {
      fetchAssetGeneration();
    }
  }, [settingsMode, hasSourceGeneration, assetGeneration, fetchAssetGeneration]);

  // Reset asset state when asset changes
  useEffect(() => {
    setAssetGeneration(null);
    setAssetPrompt('');
    setAssetError(null);
    // If we were in asset mode but new asset has no generation, switch to control center
    if (settingsMode === 'asset' && !asset.sourceGenerationId) {
      setSettingsMode('controlCenter');
    }
  }, [asset.id, asset.sourceGenerationId, settingsMode]);

  // Determine which prompt/provider to use based on mode
  const activePrompt = settingsMode === 'asset' ? assetPrompt : ccPrompt;
  const setActivePrompt = settingsMode === 'asset' ? setAssetPrompt : ccSetPrompt;
  const activeProviderId = settingsMode === 'asset' ? assetGeneration?.providerId : ccProviderId;
  const activeError = settingsMode === 'asset' ? assetError : ccError;

  const maxChars = resolvePromptLimitForModel(
    activeProviderId || ccProviderId,
    workbench.dynamicParams?.model as string | undefined,
    workbench.paramSpecs
  );

  // Auto-set operation type based on asset type (only for control center mode)
  useEffect(() => {
    if (settingsMode === 'controlCenter') {
      const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
      ccSetOperationType(targetOp);
    }
  }, [asset.type, ccSetOperationType, settingsMode]);

  // Auto-set dynamic params from viewed asset
  useEffect(() => {
    if (!asset.id) return;

    if (asset.type === 'video') {
      setDynamicParams((prev: Record<string, any>) => {
        const { video_url, ...rest } = prev;
        return { ...rest, source_asset_id: asset.id };
      });
    } else if (asset.type === 'image') {
      setDynamicParams((prev: Record<string, any>) => {
        const { image_url, ...rest } = prev;
        return { ...rest, source_asset_id: asset.id };
      });
    }
  }, [asset.id, asset.type, setDynamicParams]);

  const generationContextValue = useMemo<GenerationContextSummary>(
    () => {
      const generationId =
        settingsMode === 'asset'
          ? (asset.sourceGenerationId ?? assetGeneration?.id)
          : null;
      const ref =
        generationId != null && Number.isFinite(Number(generationId))
          ? Ref.generation(Number(generationId))
          : null;

      return {
        id: 'assetViewer',
        label: 'Asset Viewer',
        mode: settingsMode === 'asset' ? 'asset' : 'controlCenter',
        supportsMultiAsset: false,
        ref,
      };
    },
    [settingsMode, asset.sourceGenerationId, assetGeneration?.id],
  );

  const generationContextProvider = useMemo(
    () => ({
      id: 'generation:assetViewer',
      label: 'Asset Viewer',
      priority: 40,
      exposeToContextMenu: true,
      isAvailable: () => !controlCenterOpen,
      getValue: () => generationContextValue,
    }),
    [controlCenterOpen, generationContextValue],
  );

  useProvideCapability(CAP_GENERATION_CONTEXT, generationContextProvider, [generationContextValue, controlCenterOpen], {
    scope: 'root',
  });

  const shouldHide = controlCenterOpen && !alwaysExpanded;

  const handleGenerate = async () => {
    if (!activePrompt.trim() || generating) return;

    if (settingsMode === 'asset' && assetGeneration) {
      // In asset mode: load settings to control center, then generate
      // This ensures the generation uses the tweaked settings
      if (assetGeneration.operationType) {
        ccSetOperationType(assetGeneration.operationType as OperationType);
      }
      if (assetGeneration.providerId) {
        ccSetProvider(assetGeneration.providerId);
      }
      ccSetPrompt(assetPrompt);
      const params = assetGeneration.canonicalParams || assetGeneration.rawParams;
      if (params) {
        ccSetPresetParams(params);
      }
    }

    // Trigger generation
    await ccGenerate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  };

  const handleModeChange = (mode: SettingsMode) => {
    if (mode === 'asset' && !hasSourceGeneration) return;
    setSettingsMode(mode);
  };

  const ensureViewerPanels = useCallback((api: DockviewApi) => {
    const hasPrompt = !!api.getPanel('prompt');
    if (!hasPrompt) {
      api.addPanel({ id: 'prompt', component: 'prompt', title: 'Prompt' });
    }

    if (!api.getPanel('settings')) {
      api.addPanel({
        id: 'settings',
        component: 'settings',
        title: 'Settings',
        position: { direction: 'right', referencePanel: 'prompt' },
      });
    }
  }, []);

  const canGenerate = !!activePrompt.trim();

  const quickGenContext: ViewerQuickGenContext = {
    asset,
    activePrompt,
    setActivePrompt,
    maxChars,
    generating,
    activeError: activeError || null,
    assetLoading,
    settingsMode: settingsMode as ViewerQuickGenSettingsMode,
    setSettingsMode: handleModeChange,
    hasSourceGeneration,
    assetGeneration,
    handleGenerate,
    handleKeyDown,
    canGenerate,
  };

  // Memoize onReady to prevent SmartDockview re-renders
  const handleDockviewReady = useCallback((api: DockviewApi) => {
    setDockviewApi(api);
    ensureViewerPanels(api);
  }, [ensureViewerPanels]);

  useEffect(() => {
    if (!dockviewApi) return;
    // Ensure all default panels exist even if a stale layout is loaded.
    requestAnimationFrame(() => ensureViewerPanels(dockviewApi));
  }, [dockviewApi, ensureViewerPanels]);

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

  // Expanded state - show dockview layout
  return (
    <div className="space-y-2">
      {/* Header with mode toggle and close button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Quick Generate
        </span>
        <div className="flex items-center gap-1">
          {!alwaysExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
              title="Close"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="h-[360px] min-h-[280px]">
        <SmartDockview
          registry={viewerQuickGenRegistry}
          storageKey="viewer-quickgen-layout"
          context={quickGenContext}
          defaultPanelScopes={['generation']}
          panelManagerId="viewerQuickGenerate"
          defaultLayout={createViewerQuickGenLayout}
          minPanelsForTabs={1}
          deprecatedPanels={DEPRECATED_PANELS}
          onReady={handleDockviewReady}
        />
      </div>
    </div>
  );
}

// Local registry for viewer quick generate panels
// Uses local registry since this is a small embedded dockview that mounts
// independently of the main workspace (before initializePanels runs)
type ViewerQuickGenPanelId = 'prompt' | 'settings';

const viewerQuickGenRegistry = createLocalPanelRegistry<ViewerQuickGenPanelId>();

viewerQuickGenRegistry.registerAll([
  {
    id: 'prompt',
    title: 'Prompt',
    component: ViewerQuickGenPromptPanel,
    size: { minHeight: 140 },
  },
  {
    id: 'settings',
    title: 'Settings',
    component: ViewerQuickGenSettingsPanel,
    size: { minHeight: 160 },
  },
]);

// Static config - stable reference to prevent unnecessary re-renders
const DEPRECATED_PANELS = ['info'] as const;

/**
 * Create the default layout for the viewer quick generate dockview.
 */
function createViewerQuickGenLayout(api: DockviewApi) {
  api.addPanel({ id: 'prompt', component: 'prompt', title: 'Prompt' });
  api.addPanel({
    id: 'settings',
    component: 'settings',
    title: 'Settings',
    position: { direction: 'right', referencePanel: 'prompt' },
  });
}
