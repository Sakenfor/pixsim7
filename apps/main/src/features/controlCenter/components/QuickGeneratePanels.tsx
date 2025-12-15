/**
 * QuickGeneratePanels - Minimal dockview panels for asset/prompt/settings
 *
 * Simple, lightweight panel components for use in QuickGenerateModule's dockview instance.
 */
import type { IDockviewPanelProps } from 'dockview-core';
import { PromptInput } from '@pixsim7/shared.ui';
import { CompactAssetCard } from './CompactAssetCard';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import { PromptCompanionHost } from '@lib/ui/promptCompanionSlot';

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

  // Prompt panel
  prompt: string;
  setPrompt: (value: string) => void;
  providerId?: string;
  generating: boolean;

  // Settings panel
  renderSettingsPanel: () => React.ReactNode;
}

/**
 * Asset Panel - Shows selected/queued assets
 */
export function AssetPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  if (!ctx) return null;

  const {
    displayAssets,
    mainQueue,
    mainQueueIndex,
    operationType,
    isFlexibleOperation,
    removeFromQueue,
    updateLockedTimestamp,
    cycleQueue,
  } = ctx;

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

  return (
    <div className="h-full w-full p-2">
      <CompactAssetCard
        asset={displayAssets[0]}
        showRemoveButton={mainQueue.length > 0}
        onRemove={() =>
          mainQueue.length > 0 && removeFromQueue(mainQueue[0].asset.id, 'main')
        }
        lockedTimestamp={
          mainQueue.length > 0 ? mainQueue[0].lockedTimestamp : undefined
        }
        onLockTimestamp={
          mainQueue.length > 0
            ? (timestamp) =>
                updateLockedTimestamp(mainQueue[0].asset.id, timestamp, 'main')
            : undefined
        }
        hideFooter
        fillHeight
        currentIndex={mainQueueIndex}
        totalCount={mainQueue.length}
        onNavigatePrev={() => cycleQueue('main', 'prev')}
        onNavigateNext={() => cycleQueue('main', 'next')}
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
  } = ctx;

  const maxChars = resolvePromptLimit(providerId);
  const hasAsset = displayAssets.length > 0;

  return (
    <div className="h-full w-full p-2">
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
  );
}

/**
 * Settings Panel - Generation settings and controls
 */
export function SettingsPanel(props: IDockviewPanelProps<QuickGenPanelContext>) {
  const ctx = props.params;
  if (!ctx) return null;

  const { renderSettingsPanel } = ctx;

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
