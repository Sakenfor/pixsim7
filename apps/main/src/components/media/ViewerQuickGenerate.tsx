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
  } = useQuickGenerateController();

  const enqueueAsset = useGenerationQueueStore((s) => s.enqueueAsset);

  // Auto-set operation type based on asset type
  useEffect(() => {
    const targetOp: OperationType = asset.type === 'video' ? 'video_extend' : 'image_to_video';
    setOperationType(targetOp);
  }, [asset.type, setOperationType]);

  // Don't show if control center is open
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

    // Use centralized enqueueAsset for automatic queue routing
    enqueueAsset({
      asset: queueAsset,
      operationType,
    });

    // Trigger generation
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
      <div className={`transition-all duration-300 ${error ? 'ring-2 ring-red-500 ring-offset-2 rounded-lg animate-pulse' : ''}`}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the generation..."
          disabled={generating}
          autoFocus
          rows={2}
          className="w-full px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 resize-y min-h-[48px] max-h-[120px]"
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
