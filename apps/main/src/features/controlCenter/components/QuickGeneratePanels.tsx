/**
 * QuickGeneratePanels - Minimal dockview panels for asset/prompt/settings
 *
 * Simple, lightweight panel components for use in QuickGenerateModule's dockview instance.
 */
import { useRef, useEffect } from 'react';
import type { IDockviewPanelProps } from 'dockview-core';
import { PromptInput } from '@pixsim7/shared.ui';
import { CompactAssetCard } from './CompactAssetCard';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';
import { useGenerationQueueStore } from '@features/generation';

// Panel IDs
export type QuickGenPanelId = 'asset' | 'prompt' | 'settings' | 'blocks';

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

/**
 * Asset Panel - Shows selected/queued assets
 * Supports mousewheel scrolling to cycle through queue
 * Navigation pill has grid popup for quick selection
 */
export function AssetPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe directly to store for queue data (dockview params may be stale)
  const storeMainQueue = useGenerationQueueStore(s => s.mainQueue);
  const storeMainQueueIndex = useGenerationQueueStore(s => s.mainQueueIndex);
  const storeSetQueueIndex = useGenerationQueueStore(s => s.setQueueIndex);
  const storeCycleQueue = useGenerationQueueStore(s => s.cycleQueue);

  const {
    displayAssets = [],
    operationType = '',
    isFlexibleOperation = false,
    removeFromQueue,
    updateLockedTimestamp,
  } = ctx || {};

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

  if (!ctx) return null;

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

  // Build queue items for grid popup - use index as part of key to ensure uniqueness
  const queueItems = mainQueue.map((item, idx) => ({
    id: `${item.asset.id}-${idx}`,
    thumbnailUrl: item.asset.thumbnail_url,
  }));

  return (
    <div ref={containerRef} className="h-full w-full p-2 relative">
      <CompactAssetCard
        asset={displayAssets[0]}
        showRemoveButton={mainQueue.length > 0}
        onRemove={() =>
          currentQueueItem && removeFromQueue?.(currentQueueItem.asset.id, 'main')
        }
        lockedTimestamp={currentQueueItem?.lockedTimestamp}
        onLockTimestamp={
          currentQueueItem
            ? (timestamp) =>
                updateLockedTimestamp?.(currentQueueItem.asset.id, timestamp, 'main')
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
export function PromptPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  if (!ctx) return null;

  const {
    prompt,
    setPrompt,
    providerId,
    generating,
    operationType,
    displayAssets,
    isFlexibleOperation,
    error,
  } = ctx;

  const maxChars = resolvePromptLimit(providerId);
  const hasAsset = displayAssets.length > 0;

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div className={`flex-1 ${error ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          maxChars={maxChars}
          disabled={generating}
          variant="compact"
          resizable
          minHeight={100}
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
export function SettingsPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  if (!ctx) return null;

  const { renderSettingsPanel } = ctx;

  // Don't show loading state - just render empty during brief mode transitions
  if (!renderSettingsPanel || typeof renderSettingsPanel !== 'function') {
    return null;
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
export function BlocksPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  if (!ctx) return null;

  const { prompt, setPrompt, operationType, providerId } = ctx;

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
