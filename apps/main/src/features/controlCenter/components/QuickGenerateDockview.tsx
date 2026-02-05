/**
 * QuickGenerateDockview
 *
 * Dockview-based quick generate module with resizable, rearrangeable panels.
 * Wraps QuickGenPanelHost with CC-specific configuration.
 *
 * Supports two layouts:
 * - 4-panel (with asset): Asset | Prompt | Settings, with Blocks below Prompt
 * - 3-panel (no asset): Prompt | Settings, with Blocks below Prompt
 */

import type { DockviewApi } from 'dockview-core';
import { useMemo, forwardRef, useCallback } from 'react';

import {
  QuickGenPanelHost,
  QUICKGEN_PRESETS,
  QUICKGEN_PANEL_IDS,
  type QuickGenPanelHostRef,
} from '@features/generation';
import type { QuickGenPanelContext } from '@features/generation/components/QuickGeneratePanels';

export interface QuickGenerateDockviewProps {
  /** Shared context passed to all panel components */
  context: Partial<QuickGenPanelContext>;
  /** Whether to show the asset panel in layout */
  showAssetPanel: boolean;
  /** Operation type for per-op layout storage */
  operationType?: string;
  /** Callback when dockview is ready */
  onReady?: (api: DockviewApi) => void;
  /** Additional class name */
  className?: string;
  /** Panel manager ID for orchestration */
  panelManagerId?: string;
}

export interface QuickGenerateDockviewRef {
  /** Reset the layout to default */
  resetLayout: () => void;
  /** Get the dockview API */
  getApi: () => DockviewApi | null;
}

export const QuickGenerateDockview = forwardRef<QuickGenerateDockviewRef, QuickGenerateDockviewProps>(
  ({ context, showAssetPanel, operationType, onReady, className, panelManagerId }, ref) => {
    // Select panels and storage key based on showAssetPanel
    const panels = useMemo(
      () => (showAssetPanel ? QUICKGEN_PRESETS.fullWithBlocks : QUICKGEN_PRESETS.promptSettingsBlocks),
      [showAssetPanel]
    );

    const storageKey = useMemo(() => {
      const layoutVersion = operationType === 'video_transition' ? 'v6' : 'v5';
      const baseKey = showAssetPanel
        ? `dockview:quickgen:${layoutVersion}:with-asset`
        : `dockview:quickgen:${layoutVersion}:no-asset`;
      return operationType ? `${baseKey}:${operationType}` : baseKey;
    }, [showAssetPanel, operationType]);

    const defaultLayout = useMemo(() => {
      if (operationType !== 'video_transition') return undefined;

      return (api: DockviewApi) => {
        const hasAsset = panels.includes(QUICKGEN_PANEL_IDS.asset);
        const hasPrompt = panels.includes(QUICKGEN_PANEL_IDS.prompt);
        const hasSettings = panels.includes(QUICKGEN_PANEL_IDS.settings);
        const hasBlocks = panels.includes(QUICKGEN_PANEL_IDS.blocks);

        const firstPanel = hasAsset ? QUICKGEN_PANEL_IDS.asset : QUICKGEN_PANEL_IDS.prompt;
        const getTitle = (panelId: string) => {
          switch (panelId) {
            case QUICKGEN_PANEL_IDS.asset:
              return 'Asset';
            case QUICKGEN_PANEL_IDS.prompt:
              return 'Prompt';
            case QUICKGEN_PANEL_IDS.settings:
              return 'Settings';
            case QUICKGEN_PANEL_IDS.blocks:
              return 'Blocks';
            default:
              return panelId;
          }
        };
        api.addPanel({
          id: firstPanel,
          component: firstPanel,
          title: getTitle(firstPanel),
        });

        if (hasAsset && hasPrompt) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.prompt,
            component: QUICKGEN_PANEL_IDS.prompt,
            title: getTitle(QUICKGEN_PANEL_IDS.prompt),
            position: { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.asset },
          });
        }

        if (hasSettings) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.settings,
            component: QUICKGEN_PANEL_IDS.settings,
            title: getTitle(QUICKGEN_PANEL_IDS.settings),
            position: { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.prompt },
          });
        }

        if (hasBlocks) {
          api.addPanel({
            id: QUICKGEN_PANEL_IDS.blocks,
            component: QUICKGEN_PANEL_IDS.blocks,
            title: getTitle(QUICKGEN_PANEL_IDS.blocks),
            position: { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.prompt },
          });
        }
      };
    }, [operationType, panels]);

    const resolvePanelPosition = useCallback(
      (panelId: string, api: DockviewApi) => {
        if (operationType !== 'video_transition') return undefined;
        if (panelId === QUICKGEN_PANEL_IDS.prompt && api.getPanel(QUICKGEN_PANEL_IDS.asset)) {
          return { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.asset };
        }
        return undefined;
      },
      [operationType],
    );

    return (
      <QuickGenPanelHost
        ref={ref as React.Ref<QuickGenPanelHostRef>}
        panels={panels}
        storageKey={storageKey}
        context={context}
        panelManagerId={panelManagerId}
        defaultLayout={defaultLayout}
        resolvePanelPosition={resolvePanelPosition}
        onReady={onReady}
        className={className}
        minPanelsForTabs={2}
      />
    );
  }
);

QuickGenerateDockview.displayName = 'QuickGenerateDockview';
