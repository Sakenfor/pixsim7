/**
 * useQuickGenPanelLayout
 *
 * Centralizes quickgen panel selection and video_transition layout logic.
 * Reads operation type from scoped session store, computes panel set based
 * on input support, and provides video_transition default layout + panel
 * position resolver when applicable.
 *
 * Hosts still compute their own storageKey (different prefixes/versions)
 * and pass it to QuickGenPanelHost.
 */

import type { DockviewApi } from 'dockview-core';
import { useMemo, useCallback } from 'react';

import { createSafeApi } from '@lib/dockview';

import { OPERATION_METADATA } from '@/types/operations';

import { QUICKGEN_PRESETS, QUICKGEN_PANEL_IDS } from '../components/QuickGenPanelHost';

import { useGenerationScopeStores } from './useGenerationScope';


export interface UseQuickGenPanelLayoutConfig {
  /**
   * Optional explicit panel IDs. When this differs from the default preset for
   * the current operation, transition-specific layout overrides are skipped.
   */
  panelIds?: readonly string[];
}

export function useQuickGenPanelLayout(config: UseQuickGenPanelLayoutConfig = {}) {
  const { panelIds } = config;
  const { useSessionStore } = useGenerationScopeStores();
  const operationType = useSessionStore((s) => s.operationType);

  const metadata = OPERATION_METADATA[operationType];
  const operationSupportsInputs = (metadata?.acceptsInput?.length ?? 0) > 0;

  const defaultPanels = useMemo(() => {
    return operationSupportsInputs ? QUICKGEN_PRESETS.full : QUICKGEN_PRESETS.promptSettings;
  }, [operationSupportsInputs]);

  const hasExplicitPanelIds = !!(panelIds && panelIds.length > 0);

  const panels = useMemo(() => {
    if (hasExplicitPanelIds) return [...(panelIds as readonly string[])];
    return [...defaultPanels];
  }, [hasExplicitPanelIds, panelIds, defaultPanels]);

  const usesCustomPanelSet = useMemo(() => {
    if (!hasExplicitPanelIds || !panelIds) return false;
    if (panelIds.length !== defaultPanels.length) return true;
    for (let i = 0; i < panelIds.length; i += 1) {
      if (panelIds[i] !== defaultPanels[i]) return true;
    }
    return false;
  }, [hasExplicitPanelIds, panelIds, defaultPanels]);

  const supportsInputs = panels.includes(QUICKGEN_PANEL_IDS.asset);

  const defaultLayout = useMemo(() => {
    if (usesCustomPanelSet) return undefined;
    if (operationType !== 'video_transition') return undefined;

    return (api: DockviewApi) => {
      const safe = createSafeApi(api);
      const hasAsset = panels.includes(QUICKGEN_PANEL_IDS.asset);
      const hasPrompt = panels.includes(QUICKGEN_PANEL_IDS.prompt);
      const hasSettings = panels.includes(QUICKGEN_PANEL_IDS.settings);

      const firstPanel = hasAsset ? QUICKGEN_PANEL_IDS.asset : QUICKGEN_PANEL_IDS.prompt;
      const getTitle = (panelId: string) => {
        switch (panelId) {
          case QUICKGEN_PANEL_IDS.asset: return 'Asset';
          case QUICKGEN_PANEL_IDS.prompt: return 'Prompt';
          case QUICKGEN_PANEL_IDS.settings: return 'Settings';
          default: return panelId;
        }
      };

      safe.addPanel({
        id: firstPanel,
        component: firstPanel,
        title: getTitle(firstPanel),
      });

      if (hasAsset && hasPrompt) {
        safe.addPanel({
          id: QUICKGEN_PANEL_IDS.prompt,
          component: QUICKGEN_PANEL_IDS.prompt,
          title: getTitle(QUICKGEN_PANEL_IDS.prompt),
          position: { direction: 'below', referencePanel: QUICKGEN_PANEL_IDS.asset },
        });
      }

      if (hasSettings) {
        safe.addPanel({
          id: QUICKGEN_PANEL_IDS.settings,
          component: QUICKGEN_PANEL_IDS.settings,
          title: getTitle(QUICKGEN_PANEL_IDS.settings),
          position: { direction: 'right', referencePanel: QUICKGEN_PANEL_IDS.prompt },
        });
      }
    };
  }, [operationType, panels, usesCustomPanelSet]);

  const resolvePanelPosition = useCallback(
    (panelId: string, api: DockviewApi) => {
      if (usesCustomPanelSet) return undefined;
      if (operationType !== 'video_transition') return undefined;
      if (panelId === QUICKGEN_PANEL_IDS.prompt && api.getPanel(QUICKGEN_PANEL_IDS.asset)) {
        return { direction: 'below' as const, referencePanel: QUICKGEN_PANEL_IDS.asset };
      }
      return undefined;
    },
    [operationType, usesCustomPanelSet],
  );

  return {
    panels,
    operationType,
    supportsInputs,
    defaultLayout,
    resolvePanelPosition,
  };
}
