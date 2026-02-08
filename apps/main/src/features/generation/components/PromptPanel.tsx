/**
 * PromptPanel - Text input for generation prompt.
 * Split from QuickGeneratePanels.tsx.
 */
import { useDockviewId } from '@lib/dockview';
import { getDurationOptions } from '@lib/generation-ui';

import {
  CAP_PROMPT_BOX,
  useProvideCapability,
  type PromptBoxContext,
} from '@features/contextHub';
import {
  useGenerationWorkbench,
  resolveDisplayAssets,
} from '@features/generation';
import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_PROMPT_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId } from '@features/panels';
import { PromptComposer, useQuickGenerateController } from '@features/prompts';

import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { FLEXIBLE_OPERATIONS, type QuickGenPanelProps } from './quickGenPanelTypes';


export function PromptPanel(props: QuickGenPanelProps) {
  const ctx = props.context;
  const allowAnySelected = !ctx;
  const controller = useQuickGenerateController();
  // Use scope instanceId if available, else fall back to dockview-computed instanceId
  const scopeInstanceId = useScopeInstanceId("generation");
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-prompt';
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

  // Get workbench for fallback model and paramSpecs when no context provided
  const workbench = useGenerationWorkbench({ operationType: controller.operationType });

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
    model = workbench.dynamicParams?.model as string | undefined,
    paramSpecs = workbench.allParamSpecs,
    generating = controller.generating,
    operationType = controller.operationType,
    operationInputIndex = controller.operationInputIndex,
    displayAssets = resolveDisplayAssets({
      operationType,
      inputs: controller.operationInputs,
      currentIndex: controller.operationInputIndex,
      lastSelectedAsset: controller.lastSelectedAsset,
      allowAnySelected,
    }),
    isFlexibleOperation: _isFlexibleOperation = FLEXIBLE_OPERATIONS.has(operationType),
    transitionPrompts = controller.prompts,
    setTransitionPrompts = controller.setPrompts,
    transitionDurations = controller.transitionDurations,
    setTransitionDurations = controller.setTransitionDurations,
    error = controller.error,
  } = ctx || {};
  void _isFlexibleOperation; // Used in PromptPanel for future capability hints

  const maxChars = resolvePromptLimitForModel(providerId, model, paramSpecs as any);
  const hasAsset = displayAssets.length > 0;
  const isTransitionMode = operationType === 'video_transition';
  const transitionCount = Math.max(0, (displayAssets?.length ?? 0) - 1);
  const transitionIndex = Math.max(0, Math.min(operationInputIndex - 1, transitionCount - 1));
  const hasTransitionPrompt = isTransitionMode && transitionCount > 0;

  const durationOptions =
    getDurationOptions(paramSpecs as any, model)?.options ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const currentTransitionDuration =
    hasTransitionPrompt && transitionDurations?.[transitionIndex] !== undefined
      ? transitionDurations[transitionIndex]
      : durationOptions[0];

  const promptValue = hasTransitionPrompt
    ? transitionPrompts?.[transitionIndex] ?? ''
    : prompt;
  const handlePromptChange = (value: string) => {
    if (!hasTransitionPrompt) {
      setPrompt(value);
      return;
    }
    setTransitionPrompts((prev) => {
      const next = [...(prev ?? [])];
      while (next.length < transitionCount) {
        next.push('');
      }
      next[transitionIndex] = value;
      return next;
    });
  };

  useProvideCapability<PromptBoxContext>(
    CAP_PROMPT_BOX,
    {
      id: `quickgen-prompt:${panelInstanceId}`,
      label: 'Prompt Box',
      priority: 50,
      getValue: () => ({
        prompt: promptValue,
        setPrompt: handlePromptChange,
        maxChars,
        providerId,
        operationType,
      }),
    },
    [promptValue, handlePromptChange, maxChars, providerId, operationType, panelInstanceId],
    { scope: capabilityScope },
  );

  return (
    <div className="h-full w-full p-2 flex flex-col gap-2">
      <div
        className={`flex-1 ${error ? 'ring-2 ring-red-500 rounded-lg' : ''}`}
        style={{ transition: 'none', animation: 'none' }}
      >
        {isTransitionMode && (
          <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
            <div>
              {transitionCount > 0
                ? `Transition ${transitionIndex + 1} -> ${transitionIndex + 2}`
                : 'Add one more image to edit prompts'}
            </div>
            {transitionCount > 0 && (
              <select
                value={currentTransitionDuration}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setTransitionDurations((prev) => {
                    const next = [...(prev ?? [])];
                    while (next.length < transitionCount) {
                      next.push(durationOptions[0]);
                    }
                    next[transitionIndex] = nextValue;
                    return next;
                  });
                }}
                disabled={generating}
                className="px-2 py-0.5 text-[10px] rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                {durationOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}s</option>
                ))}
              </select>
            )}
          </div>
        )}
        <PromptComposer
          value={promptValue}
          onChange={handlePromptChange}
          maxChars={maxChars}
          disabled={generating || (isTransitionMode && transitionCount === 0)}
          variant={resolvedPromptSettings.variant}
          showCounter={resolvedPromptSettings.showCounter}
          resizable={resolvedPromptSettings.resizable}
          minHeight={resolvedPromptSettings.minHeight}
          placeholder={
            isTransitionMode
              ? (transitionCount > 0 ? 'Describe the motion...' : 'Add one more image...')
              : operationType === 'image_to_video'
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
