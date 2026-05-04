/**
 * SettingsPanel for QuickGenerate.
 * Split from QuickGeneratePanels.tsx.
 */
import { Suspense, lazy } from 'react';

import { useDockviewId } from '@lib/dockview';

import {
  CAP_PROMPT_BOX,
  CAP_GENERATION_WIDGET,
  CAP_GENERATE_ACTION,
  useCapability,
  usePanelContext,
  useProvideCapability,
  type PromptBoxContext,
  type GenerateActionContext,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  GenerationSourceToggle,
} from '@features/generation';
import {
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_SETTINGS_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId, GENERATION_SCOPE_ID } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';

import { OPERATION_METADATA } from '@/types/operations';

import type { QuickGenPanelContext, QuickGenPanelProps } from './quickGenPanelTypes';

// GenerationSettingsPanel is the heaviest piece in the quickgen tree
// (~1.2k lines + cost estimates, model dropdowns, mask picker, etc).
// Lazy-loading it lets quickgen-settings register and the prompt/asset
// panels render without waiting for this chunk to download.
const GenerationSettingsPanel = lazy(() =>
  import('./GenerationSettingsPanel').then((m) => ({
    default: m.GenerationSettingsPanel,
  })),
);

function GenerationSettingsPanelFallback() {
  return (
    <div
      className="h-full w-full p-2 flex flex-col gap-2 animate-pulse"
      role="status"
      aria-label="Loading generation settings"
    >
      <div className="h-8 rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
      <div className="h-8 rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
      <div className="h-24 rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
      <div className="h-10 mt-auto rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
    </div>
  );
}


/**
 * Settings Panel - Generation settings and controls
 */
export function SettingsPanel(props: QuickGenPanelProps) {
  const panelContext = usePanelContext<QuickGenPanelContext>();
  const ctx = props.context ?? panelContext ?? undefined;
  const controller = useQuickGenerateController();
  const { value: promptBox } = useCapability<PromptBoxContext>(CAP_PROMPT_BOX);
  const { provider: generationWidgetProvider } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  // Use scope instanceId if available, else fall back to dockview-computed instanceId
  const scopeInstanceId = useScopeInstanceId(GENERATION_SCOPE_ID);
  const dockviewId = useDockviewId();
  const panelInstanceId = props.api?.id ?? props.panelId ?? 'quickgen-settings';
  const instanceId = scopeInstanceId ?? getInstanceId(dockviewId, panelInstanceId);
  const capabilityScope = resolveCapabilityScopeFromScopeInstanceId(scopeInstanceId);

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
  const derivedTargetProviderId = dockviewId ? `generation-widget:${dockviewId}` : undefined;
  const targetProviderId =
    ctx?.targetProviderId ?? generationWidgetProvider?.id ?? derivedTargetProviderId;

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
    { scope: capabilityScope },
  );

  // Build source toggle element from context (if provided)
  const sourceToggle = ctx?.onSourceToggleModeChange ? (
    <GenerationSourceToggle
      mode={ctx.sourceToggleMode!}
      sourceGenerationId={ctx.sourceToggleGenerationId}
      onModeChange={ctx.onSourceToggleModeChange}
    />
  ) : undefined;

  // Don't show loading state - just render empty during brief mode transitions
  if (useDefaultPanel) {
    return (
      <div className="h-full w-full p-2 min-h-0 overflow-hidden">
        <Suspense fallback={<GenerationSettingsPanelFallback />}>
          <GenerationSettingsPanel
            showOperationType={resolvedSettings.showOperationType}
            showProvider={resolvedSettings.showProvider}
            showPresets={resolvedSettings.showInputSets}
            generating={controller.generating}
            canGenerate={canGenerate}
            onGenerate={controller.generate}
            error={controller.error}
            targetProviderId={targetProviderId}
            queueProgress={controller.queueProgress}
            onGenerateBurst={(count) => controller.generate({ count })}
            onGenerateSequentialBurst={controller.generateSequentialBurst}
            onGenerateEach={(fanoutOptions) => controller.generateEach({ fanoutOptions })}
            onGenerateCurrentOnly={controller.generateCurrentOnly}
            sourceToggle={sourceToggle}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2 min-h-0 overflow-hidden">
      {renderSettingsPanel()}
    </div>
  );
}

