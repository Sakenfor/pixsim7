/**
 * SettingsPanel and BlocksPanel for QuickGenerate.
 * Split from QuickGeneratePanels.tsx.
 */
import { useDockviewId } from '@lib/dockview';
import { PromptCompanionHost } from '@lib/ui';

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
  GenerationSettingsPanel,
} from '@features/generation';
import {
  QUICKGEN_SETTINGS_COMPONENT_ID,
  QUICKGEN_SETTINGS_DEFAULTS,
} from '@features/generation/lib/quickGenerateComponentSettings';
import { useResolveComponentSettings, getInstanceId, useScopeInstanceId, resolveCapabilityScopeFromScopeInstanceId } from '@features/panels';
import { useQuickGenerateController } from '@features/prompts';

import { OPERATION_METADATA } from '@/types/operations';

import type { QuickGenPanelContext, QuickGenPanelProps } from './quickGenPanelTypes';


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
  const scopeInstanceId = useScopeInstanceId("generation");
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

  // Don't show loading state - just render empty during brief mode transitions
  if (useDefaultPanel) {
    return (
      <div className="h-full w-full p-2">
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
          onGenerateBurst={controller.generateBurst}
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
