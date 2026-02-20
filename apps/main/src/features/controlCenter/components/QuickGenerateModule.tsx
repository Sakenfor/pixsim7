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
  useProvideGenerationWidget,
  useQuickGenPanelLayout,
  useQuickGenScopeSync,
  QuickGenPanelHost,
  GenerationScopeProvider,
  type QuickGenPanelHostRef,
} from '@features/generation';



const QUICKGEN_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;
/** Outer dockview ID — the CC dock where the quickgen module panel lives */
const CC_DOCKVIEW_ID = 'controlCenter';
/** Inner dockview ID — distinct from the outer CC dock to avoid host registry collision */
const CC_QUICKGEN_DOCKVIEW_ID = 'ccQuickgen';

type QuickGenerateModuleProps = IDockviewPanelProps & { panelId?: string };

export function QuickGenerateModule(props: QuickGenerateModuleProps) {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const resolvedPanelId = props.panelId ?? props.api?.id ?? 'cc-generate';

  const { scopeInstanceId, scopeLabel } = useQuickGenScopeSync({
    panelManagerId: CC_DOCKVIEW_ID,
    innerDockviewId: CC_QUICKGEN_DOCKVIEW_ID,
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
    generationId,
    operationInputs,
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

  const isMultiAssetOp = true;

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

  // Handle dockview ready - store API reference
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

  return (
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
            panelManagerId={CC_QUICKGEN_DOCKVIEW_ID}
            defaultLayout={layout.defaultLayout}
            resolvePanelPosition={layout.resolvePanelPosition}
            onReady={handleDockviewReady}
            minPanelsForTabs={2}
          />
        </div>
      </div>
    </div>
  );
}
