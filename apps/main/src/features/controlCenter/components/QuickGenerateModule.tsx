import { Ref } from '@pixsim7/shared.ref.core';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-core';
import { useMemo, useEffect, useRef, useCallback } from 'react';

import { getDockviewPanels } from '@lib/dockview';

import {
  CAP_GENERATION_CONTEXT,
  useProvideCapability,
  type GenerationContextSummary,
} from '@features/contextHub';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import {
  useGenerationWebSocket,
  useGenerationWorkbench,
  useProvideGenerationWidget,
  useQuickGenPanelLayout,
  useQuickGenScopeSync,
  QuickGenPanelHost,
  GenerationWorkbench,
  GenerationScopeProvider,
  type QuickGenPanelHostRef,
} from '@features/generation';

import { OPERATION_METADATA } from '@/types/operations';

const QUICKGEN_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;
const QUICKGEN_PANEL_MANAGER_ID = 'controlCenter';

type QuickGenerateModuleProps = IDockviewPanelProps & { panelId?: string };

export function QuickGenerateModule(props: QuickGenerateModuleProps) {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const resolvedPanelId = props.panelId ?? props.api?.id ?? 'cc-generate';

  const { scopeInstanceId, scopeLabel } = useQuickGenScopeSync({
    panelManagerId: QUICKGEN_PANEL_MANAGER_ID,
    panelIds: QUICKGEN_PANEL_IDS,
    hostPanelId: resolvedPanelId,
  });

  return (
    <GenerationScopeProvider scopeId={scopeInstanceId} label={scopeLabel}>
      <QuickGenerateModuleInner />
    </GenerationScopeProvider>
  );
}

function QuickGenerateModuleInner() {
  // Get control center state for open/close (needed before widget hook)
  const ccIsOpen = useControlCenterStore(s => s.isOpen);
  const ccSetOpen = useControlCenterStore(s => s.setOpen);

  // Centralized widget provision: controller + scoped stores + CAP_GENERATION_WIDGET
  const {
    operationType,
    providerId,
    generating,
    setProvider,
    error,
    generationId,
    operationInputs,
    generate,
    widgetProviderId,
  } = useProvideGenerationWidget({
    widgetId: 'controlCenter',
    label: 'Control Center',
    priority: 50,
    isOpen: ccIsOpen,
    setOpen: ccSetOpen,
  });

  // Centralized panel layout: panels, defaultLayout, resolvePanelPosition
  const layout = useQuickGenPanelLayout({ showBlocks: true });

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const operationMetadata = OPERATION_METADATA[operationType];
  const isMultiAssetOp = operationMetadata?.multiAssetMode !== 'single';

  // Dockview wrapper ref for layout reset
  const dockviewRef = useRef<QuickGenPanelHostRef>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  const generationContextValue = useMemo<GenerationContextSummary>(
    () => {
      const id = Number(generationId);
      const ref = Number.isFinite(id) ? Ref.generation(id) : null;

      return {
        id: 'controlCenter',
        label: 'Control Center',
        mode: operationType,
        supportsMultiAsset: isMultiAssetOp,
        ref,
      };
    },
    [operationType, isMultiAssetOp, generationId],
  );

  const generationContextProvider = useMemo(
    () => ({
      id: 'generation:controlCenter',
      label: 'Control Center',
      priority: 60,
      exposeToContextMenu: true,
      isAvailable: () => true,
      getValue: () => generationContextValue,
    }),
    [generationContextValue],
  );

  useProvideCapability(CAP_GENERATION_CONTEXT, generationContextProvider, [generationContextValue], {
    scope: 'root',
  });

  // Get quality options filtered by model (for image operations)
  const getQualityOptionsForModel = useMemo(() => {
    const spec = workbench.paramSpecs.find((p) => p.name === 'quality');
    if (!spec) return null;

    const metadata = spec.metadata;
    const perModelOptions = metadata?.per_model_options as Record<string, string[]> | undefined;
    const modelValue = workbench.dynamicParams?.model;

    if (perModelOptions && typeof modelValue === 'string') {
      const normalizedModel = modelValue.toLowerCase();
      const matchEntry = Object.entries(perModelOptions).find(
        ([key]) => key.toLowerCase() === normalizedModel
      );
      if (matchEntry) {
        return matchEntry[1];
      }
    }

    // Fall back to enum from spec
    return spec.enum ?? null;
  }, [workbench.paramSpecs, workbench.dynamicParams?.model]);

  // Reset quality when model changes and current quality is invalid for new model
  useEffect(() => {
    if (!getQualityOptionsForModel) return;
    const currentQuality = workbench.dynamicParams?.quality;
    if (currentQuality && !getQualityOptionsForModel.includes(currentQuality)) {
      // Current quality not valid for this model, reset to first valid option
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    } else if (!currentQuality && getQualityOptionsForModel.length > 0) {
      // No quality set, set default
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    }
  }, [getQualityOptionsForModel, workbench.dynamicParams?.quality]);

  const panelContext = useMemo(
    () => ({ targetProviderId: widgetProviderId, sourceLabel: 'Control Center' }),
    [widgetProviderId],
  );

  // Compute storage key for panel layout persistence
  const storageKey = useMemo(() => {
    const layoutVersion = operationType === 'video_transition' ? 'v6' : 'v5';
    const baseKey = layout.supportsInputs
      ? `dockview:quickgen:${layoutVersion}:with-asset`
      : `dockview:quickgen:${layoutVersion}:no-asset`;
    return operationType ? `${baseKey}:${operationType}` : baseKey;
  }, [layout.supportsInputs, operationType]);

  // Listen to global panel layout reset trigger
  const panelLayoutResetTrigger = useControlCenterStore(s => s.panelLayoutResetTrigger);
  useEffect(() => {
    if (panelLayoutResetTrigger > 0) {
      dockviewRef.current?.resetLayout();
    }
  }, [panelLayoutResetTrigger]);

  // Handle dockview ready - store API reference and focus asset panel when inputs grow
  const handleDockviewReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;
  }, []);

  // Focus asset panel when inputs are added
  const prevInputLengthRef = useRef(operationInputs.length);
  useEffect(() => {
    const prevLength = prevInputLengthRef.current;
    const currentLength = operationInputs.length;

    // Asset was added (inputs grew)
    if (currentLength > prevLength && currentLength > 0 && dockviewApiRef.current) {
      // Use requestAnimationFrame to ensure layout is ready
      requestAnimationFrame(() => {
        if (!dockviewApiRef.current) return;
        const assetPanel = getDockviewPanels(dockviewApiRef.current)
          .find((panel) => panel?.id === 'quickgen-asset');
        if (assetPanel && !assetPanel.api.isActive) {
          assetPanel.api.setActive();
        }
      });
    }

    prevInputLengthRef.current = currentLength;
  }, [operationInputs.length]);

  const renderContent = () => (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <div
          key={`dockview-${operationType}-${layout.supportsInputs ? 'with-asset' : 'no-asset'}`}
          className="h-full relative"
        >
          <QuickGenPanelHost
            ref={dockviewRef}
            panels={layout.panels}
            storageKey={storageKey}
            context={panelContext}
            panelManagerId={QUICKGEN_PANEL_MANAGER_ID}
            defaultLayout={layout.defaultLayout}
            resolvePanelPosition={layout.resolvePanelPosition}
            onReady={handleDockviewReady}
            minPanelsForTabs={2}
          />
        </div>
      </div>
    </div>
  );

  return (
    <GenerationWorkbench
      className="h-full"
      // Settings bar props - hidden since we have inline settings panel
      providerId={providerId}
      providers={workbench.providers}
      paramSpecs={workbench.paramSpecs}
      dynamicParams={workbench.dynamicParams}
      onChangeParam={workbench.handleParamChange}
      onChangeProvider={setProvider}
      generating={generating}
      showSettings={workbench.showSettings}
      onToggleSettings={workbench.toggleSettings}
      operationType={operationType}
      // Generation action - hidden since we have inline Go button
      onGenerate={generate}
      // Error & status
      error={error}
      generationId={generationId}
      hideStatusDisplay
      hideSettingsBar
      hideGenerateButton
      // Render props - no header, just content with inline settings
      renderContent={renderContent}
      // No footer - blocks are now a dockview panel
    />
  );
}
