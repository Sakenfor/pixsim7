/**
 * QuickGeneratePanels - Minimal dockview panels for asset/prompt/settings
 *
 * Simple, lightweight panel components for use in QuickGenerateModule's SmartDockview instance.
 * Panels receive context via SmartDockview's injected props.
 */
import { useRef, useEffect, useMemo } from 'react';
import type { IDockviewPanelProps } from 'dockview-core';
import { PromptInput } from '@pixsim7/shared.ui';
import { CompactAssetCard } from './CompactAssetCard';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';
import { GenerationSettingsPanel, useGenerationQueueStore } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { OPERATION_METADATA } from '@/types/operations';
import type { OperationType } from '@/types/operations';
import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
  QUICKGEN_SETTINGS_DEFAULTS,
} from '@features/controlCenter/lib/quickGenerateComponentSettings';
import {
  CAP_PROMPT_BOX,
  CAP_ASSET_INPUT,
  CAP_GENERATE_ACTION,
  useCapability,
  useProvideCapability,
  type PromptBoxContext,
  type AssetInputContext,
  type GenerateActionContext,
} from '@features/contextHub';
import { useResolveComponentSettings, getInstanceId } from '@features/panels';
import { useDockviewId } from '@lib/dockview/contextMenu';

// Panel IDs
export type QuickGenPanelId =
  | 'quickgen-asset'
  | 'quickgen-prompt'
  | 'quickgen-settings'
  | 'quickgen-blocks';

// Shared context passed to all panels
export interface QuickGenPanelContext {
  // Asset panel
  displayAssets: any[];
  mainQueue: any[];
  mainQueueIndex: number;
  operationType: string;
  isFlexibleOperation: boolean;
  removeFromQueue: (id: number, queue: 'main') => void;
  updateLockedTimestamp: (id: number, timestamp: number | undefined, queue: 'main') => void;
  cycleQueue: (queue: 'main', direction: 'prev' | 'next') => void;
  setMainQueueIndex: (index: number) => void;

  // Prompt panel
  prompt: string;
  setPrompt: (value: string) => void;
  providerId?: string;
  generating: boolean;
  error?: string | null;

  // Settings panel
  renderSettingsPanel: () => React.ReactNode;
}

// Panel props with injected context from SmartDockview
export interface QuickGenPanelProps extends IDockviewPanelProps {
  context?: QuickGenPanelContext;
  panelId: string;
}

const FLEXIBLE_OPERATIONS = new Set<OperationType>(['image_to_video', 'image_to_image']);

function resolveDisplayAssets(
  operationType: OperationType,
  mainQueue: any[],
  mainQueueIndex: number,
  multiAssetQueue: any[],
  lastSelectedAsset?: { type: 'image' | 'video'; url: string; name: string },
  inputMode?: 'single' | 'multi',
) {
  const metadata = OPERATION_METADATA[operationType];
  const isOptionalMultiAsset = metadata?.multiAssetMode === 'optional';
  const isRequiredMultiAsset = metadata?.multiAssetMode === 'required';
  const effectiveInputMode = isRequiredMultiAsset ? 'multi' : (inputMode ?? 'single');
  const isInMultiMode = (isOptionalMultiAsset && effectiveInputMode === 'multi') || isRequiredMultiAsset;

  if (operationType === 'video_transition' || isInMultiMode) {
    return multiAssetQueue.map((item: any) => item.asset);
  }

  if (mainQueue.length > 0) {
    const index = Math.max(0, Math.min(mainQueueIndex - 1, mainQueue.length - 1));
    return [mainQueue[index].asset];
  }

  if (lastSelectedAsset) {
    const matchesOperation =
      (operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
      (operationType === 'image_to_image' && lastSelectedAsset.type === 'image') ||
      (operationType === 'video_extend' && lastSelectedAsset.type === 'video');

    if (matchesOperation) {
      return [{
        id: 0,
        provider_asset_id: lastSelectedAsset.name,
        media_type: lastSelectedAsset.type,
        thumbnail_url: lastSelectedAsset.url,
        remote_url: lastSelectedAsset.url,
        provider_status: 'unknown' as const,
        description: lastSelectedAsset.name,
      }];
    }
  }

  return [];
}

/**
 * Asset Panel - Shows selected/queued assets
 * Supports mousewheel scrolling to cycle through queue
 * Navigation pill has grid popup for quick selection
 */
export function AssetPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const controller = useQuickGenerateController();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-asset';

  // Subscribe directly to store for live queue data
  const storeMainQueue = useGenerationQueueStore(s => s.mainQueue);
  const storeMainQueueIndex = useGenerationQueueStore(s => s.mainQueueIndex);
  const storeSetQueueIndex = useGenerationQueueStore(s => s.setQueueIndex);
  const storeCycleQueue = useGenerationQueueStore(s => s.cycleQueue);
  const operationInputModePrefs = useGenerationQueueStore(s => s.operationInputModePrefs);

  const {
    removeFromQueue: ctxRemoveFromQueue,
    updateLockedTimestamp: ctxUpdateLockedTimestamp,
  } = ctx || {};

  const operationType = ctx?.operationType ?? controller.operationType;
  const isFlexibleOperation = ctx?.isFlexibleOperation ?? FLEXIBLE_OPERATIONS.has(operationType);
  const removeFromQueue = ctxRemoveFromQueue ?? controller.removeFromQueue;
  const updateLockedTimestamp = ctxUpdateLockedTimestamp ?? controller.updateLockedTimestamp;

  const displayAssets = useMemo(() => {
    if (ctx?.displayAssets) return ctx.displayAssets;
    return resolveDisplayAssets(
      operationType,
      controller.mainQueue,
      controller.mainQueueIndex,
      controller.multiAssetQueue,
      controller.lastSelectedAsset,
      operationInputModePrefs[operationType],
    );
  }, [
    ctx?.displayAssets,
    operationType,
    controller.mainQueue,
    controller.mainQueueIndex,
    controller.multiAssetQueue,
    controller.lastSelectedAsset,
    operationInputModePrefs,
  ]);

  useProvideCapability<AssetInputContext>(
    CAP_ASSET_INPUT,
    {
      id: `quickgen-asset:${panelInstanceId}`,
      label: 'Asset Input',
      priority: 50,
      getValue: () => ({
        assets: displayAssets ?? [],
        supportsMulti: isFlexibleOperation,
      }),
    },
    [displayAssets, isFlexibleOperation, panelInstanceId],
  );

  // Use store values directly for queue operations
  const mainQueue = storeMainQueue;
  const mainQueueIndex = storeMainQueueIndex;
  const cycleQueue = storeCycleQueue;
  const setMainQueueIndex = (idx: number) => storeSetQueueIndex('main', idx);

  // Stable callback for wheel handler
  const handleWheelRef = useRef<(e: WheelEvent) => void>();
  handleWheelRef.current = (e: WheelEvent) => {
    if (mainQueue.length <= 1) return;

    e.preventDefault();

    // Scroll up = next, scroll down = prev (reversed for natural feel)
    if (e.deltaY < 0) {
      cycleQueue?.('main', 'next');
    } else if (e.deltaY > 0) {
      cycleQueue?.('main', 'prev');
    }
  };

  // Attach native wheel listener with passive: false
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: WheelEvent) => handleWheelRef.current?.(e);
    container.addEventListener('wheel', handler, { passive: false });

    return () => {
      container.removeEventListener('wheel', handler);
    };
  }, []);

  const hasAsset = displayAssets.length > 0;

  if (!hasAsset) {
    return (
      <div className="h-full flex items-center justify-center p-3">
        <div className="text-xs text-neutral-500 italic text-center">
          {operationType === 'video_extend' ? 'Select video' :
           isFlexibleOperation ? '+ Image (optional)' : 'Select image'}
        </div>
      </div>
    );
  }

  // Get the current queue item based on index
  const currentQueueIndex = Math.max(0, Math.min(mainQueueIndex - 1, mainQueue.length - 1));
  const currentQueueItem = mainQueue[currentQueueIndex];
  const currentAssetId = currentQueueItem?.asset?.id;

  // Build queue items for grid popup - use index as part of key to ensure uniqueness
  const queueItems = mainQueue.flatMap((item, idx) => {
    if (!item?.asset) return [];
    return [{
      id: `${item.asset.id}-${idx}`,
      thumbnailUrl: item.asset.thumbnail_url,
    }];
  });

  return (
    <div ref={containerRef} className="h-full w-full p-2 relative">
      <CompactAssetCard
        asset={displayAssets[0]}
        showRemoveButton={mainQueue.length > 0}
        onRemove={() => {
          if (currentAssetId) {
            removeFromQueue?.(currentAssetId, 'main');
          }
        }}
        lockedTimestamp={currentQueueItem?.lockedTimestamp}
        onLockTimestamp={
          currentAssetId
            ? (timestamp) =>
                updateLockedTimestamp?.(currentAssetId, timestamp, 'main')
            : undefined
        }
        hideFooter
        fillHeight
        currentIndex={mainQueueIndex}
        totalCount={mainQueue.length}
        onNavigatePrev={() => cycleQueue?.('main', 'prev')}
        onNavigateNext={() => cycleQueue?.('main', 'next')}
        queueItems={queueItems}
        onSelectIndex={(idx) => setMainQueueIndex?.(idx + 1)} // Convert 0-based to 1-based
      />
    </div>
  );
}

/**
 * Prompt Panel - Text input for generation prompt
 */
export function PromptPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const controller = useQuickGenerateController();
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-prompt';
  const instanceId = getInstanceId(dockviewId, panelInstanceId);

  // Use instance-resolved component settings (global + instance overrides)
  // The resolver already merges schema defaults -> component defaults -> global -> instance
  // Pass "generation" as scopeId to match the scope toggle key
  const { settings: resolvedPromptSettings } = useResolveComponentSettings<typeof QUICKGEN_PROMPT_DEFAULTS>(
    QUICKGEN_PROMPT_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const {
    prompt = controller.prompt,
    setPrompt = controller.setPrompt,
    providerId = controller.providerId,
    generating = controller.generating,
    operationType = controller.operationType,
    displayAssets = resolveDisplayAssets(
      operationType,
      controller.mainQueue,
      controller.mainQueueIndex,
      controller.multiAssetQueue,
      controller.lastSelectedAsset,
    ),
    isFlexibleOperation = FLEXIBLE_OPERATIONS.has(operationType),
    error = controller.error,
  } = ctx || {};

  const maxChars = resolvePromptLimit(providerId);
  const hasAsset = displayAssets.length > 0;

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: `quickgen-prompt:${panelInstanceId}`,
      label: 'Prompt Box',
      priority: 50,
      getValue: () => ({
        prompt,
        setPrompt,
        maxChars,
        providerId,
        operationType,
      }),
    },
    [prompt, setPrompt, maxChars, providerId, operationType, panelInstanceId],
  );

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div
        className={`flex-1 ${error ? 'ring-2 ring-red-500 rounded-lg' : ''}`}
        style={{ transition: 'none', animation: 'none' }}
      >
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          maxChars={maxChars}
          disabled={generating}
          variant={resolvedPromptSettings.variant}
          showCounter={resolvedPromptSettings.showCounter}
          resizable={resolvedPromptSettings.resizable}
          minHeight={resolvedPromptSettings.minHeight}
          placeholder={
            operationType === 'image_to_video'
              ? (hasAsset ? 'Describe the motion...' : 'Describe the video...')
              : operationType === 'image_to_image'
              ? (hasAsset ? 'Describe the transformation...' : 'Describe the image...')
              : operationType === 'text_to_image'
              ? 'Describe the image you want to create...'
              : operationType === 'text_to_video'
              ? 'Describe the video you want to create...'
              : operationType === 'video_extend'
              ? 'Describe how to continue the video...'
              : 'Describe the fusion...'
          }
          className="h-full"
        />
      </div>
      {/* Error is shown in GenerationSettingsPanel near Go button */}
    </div>
  );
}

/**
 * Settings Panel - Generation settings and controls
 */
export function SettingsPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const controller = useQuickGenerateController();
  const { value: promptBox } = useCapability<PromptBoxContext>(CAP_PROMPT_BOX);
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-settings';
  const instanceId = getInstanceId(dockviewId, panelInstanceId);

  // Use instance-resolved component settings (global + instance overrides)
  // The resolver already merges schema defaults -> component defaults -> global -> instance
  // Pass "generation" as scopeId to match the scope toggle key
  const { settings: resolvedSettings } = useResolveComponentSettings<typeof QUICKGEN_SETTINGS_DEFAULTS>(
    QUICKGEN_SETTINGS_COMPONENT_ID,
    instanceId,
    "generation",
  );

  const renderSettingsPanel = ctx?.renderSettingsPanel;
  const useDefaultPanel = !renderSettingsPanel || typeof renderSettingsPanel !== 'function';

  const metadata = OPERATION_METADATA[controller.operationType];
  const requiresPrompt = metadata?.promptRequired ?? false;
  const activePrompt = promptBox?.prompt ?? controller.prompt;
  const canGenerate = requiresPrompt ? activePrompt.trim().length > 0 : true;

  useProvideCapability<GenerateActionContext>(
    CAP_GENERATE_ACTION,
    {
      id: `quickgen-generate:${panelInstanceId}`,
      label: 'Generate Action',
      priority: 40,
      isAvailable: () => useDefaultPanel,
      getValue: () => ({
        canGenerate,
        generating: controller.generating,
        error: controller.error,
        generate: controller.generate,
      }),
    },
    [canGenerate, controller.generating, controller.error, controller.generate, panelInstanceId, useDefaultPanel],
  );

  // Don't show loading state - just render empty during brief mode transitions
  if (useDefaultPanel) {
    return (
      <div className="h-full w-full p-2">
        <GenerationSettingsPanel
          showOperationType={resolvedSettings.showOperationType}
          showProvider={resolvedSettings.showProvider}
          generating={controller.generating}
          canGenerate={canGenerate}
          onGenerate={controller.generate}
          error={controller.error}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
      {renderSettingsPanel()}
    </div>
  );
}

/**
 * Blocks Panel - Prompt companion with block analysis tools
 */
export function BlocksPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const controller = useQuickGenerateController();

  const {
    prompt = controller.prompt,
    setPrompt = controller.setPrompt,
    operationType = controller.operationType,
    providerId = controller.providerId,
  } = ctx || {};

  return (
    <div className="h-full w-full p-2 overflow-auto">
      <PromptCompanionHost
        surface="quick-generate"
        promptValue={prompt}
        setPromptValue={setPrompt}
        metadata={{ operationType, providerId }}
      />
    </div>
  );
}
