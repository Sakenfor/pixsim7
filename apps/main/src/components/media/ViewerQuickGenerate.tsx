/**
 * ViewerQuickGenerate
 *
 * Compact inline generation prompt for the asset viewer panel.
 * Shows when control center is closed, allowing quick image-to-video
 * or video-extend operations on the currently viewed asset.
 */

import { useState, useMemo } from 'react';
import { useControlCenterStore } from '@/stores/controlCenterStore';
import { useGenerationQueueStore } from '@features/generation';
import { useQuickGenerateController } from '@features/prompts';
import { Icon } from '@/lib/icons';
import type { ViewerAsset } from '@features/assets';

interface ViewerQuickGenerateProps {
  asset: ViewerAsset;
}

export function ViewerQuickGenerate({ asset }: ViewerQuickGenerateProps) {
  const controlCenterOpen = useControlCenterStore((s) => s.open);
  const [prompt, setPrompt] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    generating,
    generate,
    setOperationType,
    setPrompt: setControllerPrompt,
  } = useQuickGenerateController();

  const addToQueue = useGenerationQueueStore((s) => s.addToQueue);

  // Determine operation type based on asset type
  const operationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
  const operationLabel = asset.type === 'video' ? 'Extend' : 'Animate';
  const placeholder = asset.type === 'video'
    ? 'Describe how to continue...'
    : 'Describe the motion...';

  // Don't show if control center is open (they can use the full UI there)
  if (controlCenterOpen) {
    return null;
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    // Convert viewer asset to queue format
    const queueAsset = {
      id: Number(asset.id) || 0,
      provider_asset_id: asset.metadata?.providerId || String(asset.id),
      media_type: asset.type as 'image' | 'video',
      thumbnail_url: asset.url,
      remote_url: asset.fullUrl || asset.url,
      provider_status: 'ok' as const,
      description: asset.name,
      tags: asset.metadata?.tags || [],
      created_at: asset.metadata?.createdAt || new Date().toISOString(),
      provider_id: asset.metadata?.providerId || 'unknown',
    };

    // Add to main queue
    addToQueue(queueAsset, 'main');

    // Set operation type and prompt
    setOperationType(operationType);
    setControllerPrompt(prompt);

    // Trigger generation
    await generate();

    // Clear local prompt on success
    setPrompt('');
    setIsExpanded(false);
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

  // Collapsed state - just show a button
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full px-3 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Icon name="sparkles" size={14} />
        {operationLabel}
      </button>
    );
  }

  // Expanded state - show prompt input
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          {operationLabel}
        </span>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={generating}
          autoFocus
          className="flex-1 px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
        />
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
        >
          {generating ? (
            <span className="animate-pulse">...</span>
          ) : (
            <>
              <Icon name="sparkles" size={12} />
              Go
            </>
          )}
        </button>
      </div>
      <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
        Press Enter to generate, Esc to close
      </p>
    </div>
  );
}
