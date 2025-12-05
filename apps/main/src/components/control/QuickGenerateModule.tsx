import { useState, useMemo, useEffect } from 'react';
import clsx from 'clsx';
import { useControlCenterStore, type ControlCenterState } from '@/stores/controlCenterStore';
import { PromptInput } from '@pixsim7/shared.ui';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useGenerationQueueStore } from '@/stores/generationQueueStore';
import { useGenerationWebSocket } from '@/hooks/useGenerationWebSocket';
import { useQuickGenerateController } from '@/hooks/useQuickGenerateController';
import { useGenerationWorkbench } from '@/hooks/useGenerationWorkbench';
import { CompactAssetCard } from './CompactAssetCard';
import { ThemedIcon } from '@/lib/icons';
import { GenerationWorkbench } from '../generation/GenerationWorkbench';

export function QuickGenerateModule() {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const {
    operationType,
    providerId,
    presetId,
    generating,
    recentPrompts,
    prompt,
    setProvider,
    setOperationType,
    setPrompt,
    error,
    generationId,
    lastSelectedAsset,
    mainQueue,
    transitionQueue,
    removeFromQueue,
    clearTransitionQueue,
    prompts,
    setPrompts,
    generate,
    cycleQueue,
  } = useQuickGenerateController();

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const setPreset = useControlCenterStore(s => s.setPreset);
  const setPresetParams = useControlCenterStore(s => s.setPresetParams);
  const updateLockedTimestamp = useGenerationQueueStore(s => s.updateLockedTimestamp);

  // UI state for transition selection (which transition segment is selected)
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number>(0);

  const maxChars = resolvePromptLimit(providerId);
  const isTextOnlyOperation = operationType === 'text_to_video' || operationType === 'text_to_image';
  const canGenerate = isTextOnlyOperation
    ? prompt.trim().length > 0
    : true; // Other operations may not strictly require prompt

  // Build dynamic presets from provider specs
  const availablePresets = useMemo(() => {
    const opSpec = workbench.paramSpecs.length > 0 ? true : false;
    if (!opSpec) return [];

    // Quick presets: extract first few quality/aspect/model combos
    const getEnum = (name: string) => {
      const param = workbench.paramSpecs.find(p => p.name === name && Array.isArray(p.enum));
      return param?.enum as string[] | undefined;
    };

    const qualities = getEnum('quality') || [];
    const aspects = getEnum('aspect_ratio') || [];

    const presets: Array<{ id: string; name: string; params: Record<string, any> }> = [];

    // Create simple combos
    if (qualities.length && aspects.length) {
      const topQualities = qualities.slice(0, 2);
      const topAspects = aspects.slice(0, 2);
      for (const q of topQualities) {
        for (const a of topAspects) {
          presets.push({
            id: `${q}_${a}`,
            name: `${q} • ${a}`,
            params: { quality: q, aspect_ratio: a },
          });
        }
      }
    } else if (qualities.length) {
      qualities.slice(0, 3).forEach(q => {
        presets.push({
          id: q,
          name: q,
          params: { quality: q },
        });
      });
    }

    return presets;
  }, [workbench.paramSpecs]);

  function applyPreset(preset: { id: string; name: string; params: Record<string, any> }) {
    setPreset(preset.id);
    setPresetParams(preset.params);
  }

  // Get the asset to display based on operation type
  const getDisplayAssets = () => {
    if (operationType === 'video_transition') {
      return transitionQueue.map(q => q.asset);
    }

    // For image_to_video, image_to_image, or video_extend, prefer queue first, then active asset
    if (mainQueue.length > 0) {
      return [mainQueue[0].asset];
    }

    if (lastSelectedAsset &&
        ((operationType === 'image_to_video' && lastSelectedAsset.type === 'image') ||
         (operationType === 'image_to_image' && lastSelectedAsset.type === 'image') ||
         (operationType === 'video_extend' && lastSelectedAsset.type === 'video'))) {
      // Convert SelectedAsset to AssetSummary-like shape
      return [{
        id: 0, // placeholder
        provider_asset_id: lastSelectedAsset.name,
        media_type: lastSelectedAsset.type as 'image' | 'video',
        thumbnail_url: lastSelectedAsset.url,
        remote_url: lastSelectedAsset.url,
        provider_status: 'unknown' as const,
        description: lastSelectedAsset.name,
      } as any];
    }

    return [];
  };

  const displayAssets = getDisplayAssets();
  // Operations where we use side-by-side layout (asset + prompt)
  const isSingleAssetOperation = operationType === 'image_to_video' || operationType === 'image_to_image' || operationType === 'video_extend';

  // Reset selected transition when assets change to avoid out-of-bounds
  useEffect(() => {
    const maxIndex = Math.max(0, displayAssets.length - 2);
    if (selectedTransitionIndex > maxIndex) {
      setSelectedTransitionIndex(Math.max(0, maxIndex));
    }
  }, [displayAssets.length, selectedTransitionIndex]);

  // Render the header row with operation selector and presets
  const renderHeader = () => (
    <>
      <select
        value={operationType}
        onChange={(e) => setOperationType(e.target.value as ControlCenterState['operationType'])}
        disabled={generating}
        className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 min-w-0"
      >
        <option value="text_to_image">Text → Img</option>
        <option value="image_to_image">Img → Img</option>
        <option value="text_to_video">Text → Vid</option>
        <option value="image_to_video">Img → Vid</option>
        <option value="video_extend">Extend</option>
        <option value="video_transition">Transition</option>
        <option value="fusion">Fusion</option>
      </select>

      {/* Presets dropdown */}
      {availablePresets.length > 0 && (
        <select
          value={presetId || ''}
          onChange={(e) => {
            const selected = availablePresets.find(p => p.id === e.target.value);
            if (selected) {
              applyPreset(selected);
            } else {
              setPreset(undefined);
              setPresetParams({});
            }
          }}
          disabled={generating}
          className="p-1.5 border rounded bg-white dark:bg-neutral-900 text-xs disabled:opacity-50 max-w-[100px] min-w-0"
          title="Quick presets"
        >
          <option value="">Preset</option>
          {availablePresets.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </>
  );

  // Render the main content area based on operation type
  const renderContent = () => {
    if (operationType === 'video_transition') {
      // Transition mode: horizontal assets with prompt on right
      return (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: Asset sequence */}
          <div className="flex-shrink-0 flex flex-col gap-1 min-w-0">
            {transitionQueue.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <span>{transitionQueue.length} images</span>
                <button
                  onClick={clearTransitionQueue}
                  className="text-red-500 hover:text-red-600"
                  disabled={generating}
                  title="Clear all"
                >
                  ✕
                </button>
              </div>
            )}

            {displayAssets.length > 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {transitionQueue.map((queueItem, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className="flex-shrink-0 w-20">
                      <CompactAssetCard
                        asset={queueItem.asset}
                        label={`${idx + 1}`}
                        showRemoveButton
                        onRemove={() => removeFromQueue(queueItem.asset.id, 'transition')}
                        lockedTimestamp={queueItem.lockedTimestamp}
                        onLockTimestamp={(timestamp) => updateLockedTimestamp(queueItem.asset.id, timestamp, 'transition')}
                      />
                    </div>
                    {idx < displayAssets.length - 1 && (
                      <button
                        onClick={() => setSelectedTransitionIndex(idx)}
                        className={clsx(
                          'flex-shrink-0 p-1.5 rounded transition-colors',
                          selectedTransitionIndex === idx
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                        )}
                        title={`Transition ${idx + 1} → ${idx + 2}`}
                      >
                        <ThemedIcon name="arrowRight" size={14} variant="default" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                Add images from gallery
              </div>
            )}
          </div>

          {/* Right: Prompt for selected transition */}
          <div className="flex-1 flex flex-col min-w-0">
            {displayAssets.length > 1 ? (
              <textarea
                value={prompts[selectedTransitionIndex] || ''}
                onChange={(e) => {
                  const newPrompts = [...prompts];
                  newPrompts[selectedTransitionIndex] = e.target.value;
                  setPrompts(newPrompts);
                }}
                placeholder={`Transition ${selectedTransitionIndex + 1} → ${selectedTransitionIndex + 2}: Describe the motion...`}
                disabled={generating}
                className="flex-1 min-h-[80px] px-3 py-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50 resize-y focus:ring-2 focus:ring-blue-500/40 outline-none"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                {displayAssets.length === 1 ? 'Add one more image' : 'Add images from gallery'}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (isSingleAssetOperation) {
      // Single asset mode: side-by-side (asset left, prompt right)
      return (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: Asset */}
          <div className="flex-shrink-0 w-36">
            {displayAssets.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  {mainQueue.length > 1 && (
                    <button
                      type="button"
                      onClick={() => cycleQueue('main', 'prev')}
                      className="p-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title="Previous queued asset"
                    >
                      <ThemedIcon name="chevronLeft" size={12} variant="default" />
                    </button>
                  )}
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
                  />
                  {mainQueue.length > 1 && (
                    <button
                      type="button"
                      onClick={() => cycleQueue('main', 'next')}
                      className="p-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      title="Next queued asset"
                    >
                      <ThemedIcon name="chevronRight" size={12} variant="default" />
                    </button>
                  )}
                </div>
                {mainQueue.length > 1 && (
                  <div className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded text-center">
                    +{mainQueue.length - 1} queued
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-center h-full flex items-center justify-center">
                {operationType === 'video_extend' ? 'Select video' : 'Select image'}
              </div>
            )}
          </div>

          {/* Right: Prompt */}
          <div className="flex-1 min-w-0">
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
                  ? 'Describe the motion and action...'
                  : operationType === 'image_to_image'
                  ? 'Describe the transformation...'
                  : 'Describe how to continue the video...'
              }
              className="h-full"
            />
          </div>
        </div>
      );
    }

    // Text-only mode (text_to_image, text_to_video, fusion): full-width prompt
    return (
      <div className="flex-1 min-h-0">
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          maxChars={maxChars}
          disabled={generating}
          variant="compact"
          resizable
          minHeight={120}
          placeholder={
            operationType === 'text_to_image'
              ? 'Describe the image you want to create...'
              : operationType === 'text_to_video'
              ? 'Describe the video you want to create...'
              : 'Describe the fusion...'
          }
          className="h-full"
        />
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <GenerationWorkbench
        // Settings bar props
        providerId={providerId}
        providers={workbench.providers}
        paramSpecs={workbench.paramSpecs}
        dynamicParams={workbench.dynamicParams}
        onChangeParam={workbench.handleParamChange}
        onChangeProvider={setProvider}
        generating={generating}
        showSettings={workbench.showSettings}
        onToggleSettings={workbench.toggleSettings}
        presetId={presetId}
        operationType={operationType}
        // Generation action
        onGenerate={generate}
        canGenerate={canGenerate}
        // Error & status
        error={error}
        generationId={generationId}
        // Recent prompts
        recentPrompts={recentPrompts}
        onRestorePrompt={setPrompt}
        // Render props
        renderHeader={renderHeader}
        renderContent={renderContent}
      />
    </div>
  );
}
