import type { DockviewApi, IDockviewPanelProps } from 'dockview-core';
import { useEffect, useRef, useCallback } from 'react';

import { getDockviewPanels } from '@lib/dockview';

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import {
  useGenerationWebSocket,
  QuickGenWidget,
  type QuickGenPanelHostRef,
  type QuickGenWidgetRenderContext,
} from '@features/generation';

const CC_PANEL_IDS = ['quickgen-asset', 'quickgen-prompt', 'quickgen-settings', 'quickgen-blocks'] as const;

type QuickGenerateModuleProps = IDockviewPanelProps & { panelId?: string };

export function QuickGenerateModule(props: QuickGenerateModuleProps) {
  // Connect to WebSocket for real-time updates
  useGenerationWebSocket();

  const ccIsOpen = useControlCenterStore(s => s.isOpen);
  const ccSetOpen = useControlCenterStore(s => s.setOpen);

  const resolvedPanelId = props.panelId ?? props.api?.id ?? 'cc-generate';

  // Dockview wrapper ref for layout reset
  const dockviewRef = useRef<QuickGenPanelHostRef>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  // Listen to global panel layout reset trigger
  const panelLayoutResetTrigger = useControlCenterStore(s => s.panelLayoutResetTrigger);
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
      panelManagerId="ccQuickgen"
      hostDockviewId="controlCenter"
      hostPanelId={resolvedPanelId}
      panelIds={CC_PANEL_IDS}
      priority={50}
      isOpen={ccIsOpen}
      setOpen={ccSetOpen}
      showBlocks
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
