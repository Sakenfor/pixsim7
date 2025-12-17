/**
 * ViewerQuickGenerate
 *
 * Compact inline generation panel for the asset viewer.
 * Shows when control center is closed, providing full generation settings
 * for the currently viewed asset without needing to open Control Center.
 */

import { useState, useEffect } from 'react';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { GenerationSettingsPanel, useGenerationQueueStore } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { Icon } from '@lib/icons';
import { PromptInput } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '@/utils/prompt/limits';
import type { ViewerAsset } from '@features/assets';
import type { OperationType } from '@/types/operations';

interface ViewerQuickGenerateProps {
  asset: ViewerAsset;
}

export function ViewerQuickGenerate({ asset }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    generating,
    generate,
    operationType,
    setOperationType,
    prompt,
    setPrompt,
    error,
    providerId,
    dynamicParams,
    setDynamicParams,
  } = useQuickGenerateController();

  const maxChars = resolvePromptLimit(providerId);

  // Auto-set operation type based on asset type
  useEffect(() => {
    const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
    setOperationType(targetOp);
  }, [asset.type, setOperationType]);

  // Auto-set dynamic params from viewed asset
  // This bypasses the queue to avoid index race conditions
  useEffect(() => {
    const assetUrl = asset.fullUrl || asset.url;

    if (asset.type === 'video') {
      setDynamicParams((prev: Record<string, any>) => ({ ...prev, video_url: assetUrl }));
    } else if (asset.type === 'image') {
      setDynamicParams((prev: Record<string, any>) => ({ ...prev, image_url: assetUrl }));
    }
  }, [asset.fullUrl, asset.url, asset.type, setDynamicParams]);

  // Don't show if control center is open
  if (controlCenterOpen) {
    return null;
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    // Trigger generation (asset URL is already set in dynamicParams via useEffect)
    await generate();

    // Keep prompt and panel open for iteration
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

  // Collapsed state - just show icon button (no label)
  if (!isExpanded) {
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

  // Expanded state - show full generation panel
  return (
    <div className="space-y-2">
      {/* Header with close button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          Quick Generate
        </span>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
          title="Close"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Prompt input */}
      <div
        className={`transition-all duration-300 ${error ? 'ring-2 ring-red-500 ring-offset-2 rounded-lg animate-pulse' : ''}`}
        onKeyDown={handleKeyDown}
      >
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          maxChars={maxChars}
          placeholder="Describe the generation..."
          disabled={generating}
          autoFocus
          variant="compact"
          resizable
          minHeight={48}
          showCounter={true}
        />
      </div>

      {/* Settings panel with all generation options */}
      <div className="-mx-2">
        <GenerationSettingsPanel
          showOperationType={false}
          generating={generating}
          canGenerate={!!prompt.trim()}
          onGenerate={handleGenerate}
          error={error}
        />
      </div>

      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        Press Enter to generate, Esc to close
      </p>
    </div>
  );
}
