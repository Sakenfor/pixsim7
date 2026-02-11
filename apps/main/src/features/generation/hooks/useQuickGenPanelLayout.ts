/**
 * useQuickGenPanelLayout
 *
 * Centralizes quickgen panel selection and video_transition layout logic.
 * Reads operation type from scoped session store, computes panel set based
 * on input support and showBlocks config, and provides video_transition
 * default layout + panel position resolver when applicable.
 *
 * Hosts still compute their own storageKey (different prefixes/versions)
 * and pass it to QuickGenPanelHost.
 */

import type { DockviewApi } from 'dockview-core';
import { useMemo, useCallback } from 'react';

import { OPERATION_METADATA } from '@/types/operations';

import { QUICKGEN_PRESETS, QUICKGEN_PANEL_IDS } from '../components/QuickGenPanelHost';

import { useGenerationScopeStores } from './useGenerationScope';


export interface UseQuickGenPanelLayoutConfig {
  /** Include blocks panel in layout. CC: true, viewer: false */
  showBlocks?: boolean;
}

export function useQuickGenPanelLayout(config: UseQuickGenPanelLayoutConfig = {}) {
  const { showBlocks = false } = config;
  const { useSessionStore } = useGenerationScopeStores();
  const operationType = useSessionStore((s) => s.operationType);

  const metadata = OPERATION_METADATA[operationType];
  const supportsInputs = (metadata?.acceptsInput?.length ?? 0) > 0;

  const panels = useMemo(() => {
    if (supportsInputs) {
      return showBlocks ? QUICKGEN_PRESETS.fullWithBlocks : QUICKGEN_PRESETS.full;
    }
    return showBlocks ? QUICKGEN_PRESETS.promptSettingsBlocks : QUICKGEN_PRESETS.promptSettings;
  }, [supportsInputs, showBlocks]);

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
        return { direction: 'below' as const, referencePanel: QUICKGEN_PANEL_IDS.asset };
      }
      return undefined;
    },
    [operationType],
  );

  return {
    panels,
    operationType,
    supportsInputs,
    defaultLayout,
    resolvePanelPosition,
  };
}
