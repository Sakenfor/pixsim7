import type { DockviewApi } from 'dockview-core';
import { useEffect, useRef, useCallback } from 'react';

import { getDockviewPanels } from '@lib/dockview';

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useDockState, useDockUiStore } from '@features/docks/stores';
import {
  useGenerationWebSocket,
  useRegisterQuickGenOpener,
  QuickGenWidget,
  type QuickGenPanelHostRef,
  type QuickGenWidgetRenderContext,
} from '@features/generation';
import { DOCK_IDS } from '@features/panels/lib/panelIds';

const CC_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings'] as const;

export function QuickGenerateModule() {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const ccIsOpen = useDockState(DOCK_IDS.controlCenter, (dock) => dock.open);
  const setDockOpen = useDockUiStore((s) => s.setDockOpen);
  const ccSetOpen = useCallback(
    (open: boolean) => setDockOpen(DOCK_IDS.controlCenter, open),
    [setDockOpen],
  );

  // Expose Control Center as an "Open With" target: switch it to Quick Generate
  // and reveal the dock — works even while the widget reports closed (the dock
  // toggle is global), so a routed intent can land here from anywhere.
  const openControlCenterQuickGen = useCallback(() => {
    useControlCenterStore.getState().setActiveModule('quickGenerate');
    setDockOpen(DOCK_IDS.controlCenter, true);
  }, [setDockOpen]);
  useRegisterQuickGenOpener({
    widgetId: 'controlCenter',
    label: 'Control Center',
    open: openControlCenterQuickGen,
    order: 10,
  });

  // Dockview wrapper ref for layout reset
  const dockviewRef = useRef<QuickGenPanelHostRef>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  // Listen to global panel layout reset trigger
  const panelLayoutResetTrigger = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.panelLayoutResetTrigger,
  );
  useEffect(() => {
    if (panelLayoutResetTrigger > 0) {
      dockviewRef.current?.resetLayout();
    }
  }, [panelLayoutResetTrigger]);

  // Handle dockview ready — store API reference
  const handleDockviewReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;
  }, []);

  return (
    <QuickGenWidget
      ref={dockviewRef}
      widgetId="controlCenter"
      label="Control Center"
      panelManagerId="controlCenter"
      panelIds={CC_PANEL_IDS}
      priority={50}
      isOpen={ccIsOpen}
      setOpen={ccSetOpen}
      contextPriority={60}
      storageKeyPrefix="quickgen"
      className="h-full flex flex-col"
      onReady={handleDockviewReady}
      minPanelsForTabs={2}
    >
      {(ctx) => <CCAssetFocuser operationInputs={ctx.operationInputs} dockviewApiRef={dockviewApiRef} />}
    </QuickGenWidget>
  );
}

/**
 * Focuses the asset panel when inputs are added.
 * Extracted to a child so it can read operationInputs from render context.
 */
function CCAssetFocuser({
  operationInputs,
  dockviewApiRef,
}: {
  operationInputs: QuickGenWidgetRenderContext['operationInputs'];
  dockviewApiRef: React.RefObject<DockviewApi | null>;
}) {
  const prevInputLengthRef = useRef(operationInputs.length);

  useEffect(() => {
    const prevLength = prevInputLengthRef.current;
    const currentLength = operationInputs.length;

    // Asset was added (inputs grew)
    if (currentLength > prevLength && currentLength > 0 && dockviewApiRef.current) {
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
  }, [operationInputs.length, dockviewApiRef]);

  return null;
}
