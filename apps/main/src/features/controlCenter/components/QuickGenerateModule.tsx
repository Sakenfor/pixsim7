import { Ref } from '@pixsim7/shared.ref.core';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-core';
import { useMemo, useEffect, useRef, useCallback } from 'react';

import { getDockviewPanels, useDockviewId } from '@lib/dockview';

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
  QuickGenPanelHost,
  GenerationWorkbench,
  GenerationScopeProvider,
  type QuickGenPanelHostRef,
} from '@features/generation';
import {
  ScopeModeSelect,
  getInstanceId,
  getScopeMode,
  panelSettingsScopeRegistry,
  resolveScopeInstanceId,
  usePanelInstanceSettingsStore,
  GENERATION_SCOPE_ID,
  type PanelSettingsScopeMode,
} from '@features/panels';
import type { PanelId } from '@features/workspace';

import { OPERATION_METADATA } from '@/types/operations';

const QUICKGEN_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;
const QUICKGEN_PANEL_MANAGER_ID = 'controlCenter';
const GENERATION_SCOPE_FALLBACK = { id: GENERATION_SCOPE_ID, defaultMode: 'local' } as const;

type QuickGenerateModuleProps = IDockviewPanelProps & { panelId?: string };

interface QuickGenerateModuleInnerProps {
  scopeMode: PanelSettingsScopeMode;
  onScopeChange: (next: PanelSettingsScopeMode) => void;
  scopeLabel: string;
}

export function QuickGenerateModule(props: QuickGenerateModuleProps) {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();
  const dockviewId = useDockviewId();
  const resolvedPanelId = (props.panelId ?? props.api?.id ?? 'cc-generate') as PanelId;
  // Use fallback dockviewId to ensure stable storage keys even if context isn't ready yet
  const stableDockviewId = dockviewId ?? QUICKGEN_PANEL_MANAGER_ID;
  const panelInstanceId = useMemo(
    () => getInstanceId(stableDockviewId, resolvedPanelId),
    [stableDockviewId, resolvedPanelId],
  );
  const generationScopeDefinition =
    panelSettingsScopeRegistry.get(GENERATION_SCOPE_ID) ?? GENERATION_SCOPE_FALLBACK;
  const instanceScopes = usePanelInstanceSettingsStore(
    (state) => state.instances[panelInstanceId]?.scopes,
  );
  const scopeMode = useMemo(
    () => getScopeMode(instanceScopes, generationScopeDefinition, GENERATION_SCOPE_FALLBACK.defaultMode),
    [instanceScopes, generationScopeDefinition],
  );
  const setScope = usePanelInstanceSettingsStore((state) => state.setScope);
  const quickgenInstances = useMemo(
    () =>
      QUICKGEN_PANEL_IDS.map((panelId) => ({
        panelId: panelId as PanelId,
        instanceId: getInstanceId(QUICKGEN_PANEL_MANAGER_ID, panelId),
      })),
    [],
  );
  const needsScopeSync = usePanelInstanceSettingsStore((state) =>
    quickgenInstances.some(({ instanceId }) => {
      const scopes = state.instances[instanceId]?.scopes;
      return getScopeMode(scopes, generationScopeDefinition, GENERATION_SCOPE_FALLBACK.defaultMode) !== scopeMode;
    }),
  );

  useEffect(() => {
    if (!needsScopeSync) return;
    quickgenInstances.forEach(({ instanceId, panelId }) => {
      setScope(instanceId, panelId, GENERATION_SCOPE_ID, scopeMode);
    });
  }, [needsScopeSync, quickgenInstances, setScope, scopeMode]);

  const handleScopeChange = useCallback(
    (next: PanelSettingsScopeMode) => {
      setScope(panelInstanceId, resolvedPanelId, GENERATION_SCOPE_ID, next);
      quickgenInstances.forEach(({ instanceId, panelId }) => {
        setScope(instanceId, panelId, GENERATION_SCOPE_ID, next);
      });
    },
    [panelInstanceId, resolvedPanelId, quickgenInstances, setScope],
  );

  const scopeInstanceId = useMemo(() => {
    if (generationScopeDefinition.resolveScopeId) {
      return resolveScopeInstanceId(generationScopeDefinition, scopeMode, {
        instanceId: panelInstanceId,
        panelId: resolvedPanelId,
        dockviewId: stableDockviewId,
      });
    }

    return scopeMode === 'global' ? 'global' : panelInstanceId;
  }, [generationScopeDefinition, scopeMode, panelInstanceId, resolvedPanelId, stableDockviewId]);

  const scopeLabel = generationScopeDefinition.label ?? 'Generation Settings';

  return (
    <GenerationScopeProvider scopeId={scopeInstanceId} label={scopeLabel}>
      <QuickGenerateModuleInner
        scopeMode={scopeMode}
        onScopeChange={handleScopeChange}
        scopeLabel={scopeLabel}
      />
    </GenerationScopeProvider>
  );
}

function QuickGenerateModuleInner({ scopeMode, onScopeChange, scopeLabel }: QuickGenerateModuleInnerProps) {
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

  // Render the main content area based on operation type and input mode
  const scopeControl = (
    <div className="flex items-center justify-between rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/40 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {scopeLabel}
      </div>
      <ScopeModeSelect
        value={scopeMode}
        onChange={onScopeChange}
        ariaLabel="Generation scope mode"
      />
    </div>
  );

  const renderContent = () => (
    <div className="h-full flex flex-col gap-2">
      {scopeControl}
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
