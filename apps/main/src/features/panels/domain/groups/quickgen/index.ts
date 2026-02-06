/**
 * QuickGen Panel Group Definition
 *
 * Defines the generation workflow panel group used in Control Center,
 * Asset Viewer, and other generation contexts.
 *
 * Panels:
 * - asset: Asset input panel for images/videos
 * - prompt: Prompt editor with enhancement tools
 * - settings: Generation parameters and provider selection
 * - blocks: Workflow blocks (masking, timing, etc.)
 */

import type { DockviewApi } from 'dockview-core';

import { definePanelGroup } from '@features/panels/lib/definePanelGroup';

/** QuickGen slot names */
export type QuickGenSlot = 'asset' | 'prompt' | 'settings' | 'blocks';

/** QuickGen preset names */
export type QuickGenPreset = 'promptSettings' | 'full' | 'fullWithBlocks' | 'promptSettingsBlocks';

/**
 * QuickGen Panel Group
 *
 * A reusable generation workflow that can be hosted in:
 * - Control Center (main generation interface)
 * - Asset Viewer (inline quick generate)
 * - Floating windows
 * - Custom containers
 */
const quickgenGroup = definePanelGroup<QuickGenSlot, QuickGenPreset>({
  id: 'quickgen',
  title: 'Quick Generate',
  description: 'Generation workflow panels for prompt, settings, and asset inputs',
  icon: 'sparkles',
  category: 'generation',
  tags: ['generation', 'workflow', 'quickgen', 'prompt', 'settings'],

  // Panel slots - maps slot names to actual panel IDs
  panels: {
    asset: 'quickgen-asset',
    prompt: 'quickgen-prompt',
    settings: 'quickgen-settings',
    blocks: 'quickgen-blocks',
  },

  // Common presets
  presets: {
    /** Prompt + Settings (no asset) - for viewer, text-to-* ops */
    promptSettings: {
      slots: ['prompt', 'settings'],
      description: 'Minimal layout for text generation or viewer quick generate',
    },
    /** Asset + Prompt + Settings - for CC single-asset mode */
    full: {
      slots: ['asset', 'prompt', 'settings'],
      description: 'Standard layout with asset input',
    },
    /** Full with blocks panel */
    fullWithBlocks: {
      slots: ['asset', 'prompt', 'settings', 'blocks'],
      description: 'Full layout with workflow blocks',
    },
    /** Prompt + Settings + Blocks (no asset) */
    promptSettingsBlocks: {
      slots: ['prompt', 'settings', 'blocks'],
      description: 'Text-only mode with workflow blocks',
    },
  },

  // Default panel scopes
  defaultScopes: ['generation'],

  // Panel titles
  panelTitles: {
    asset: 'Asset',
    prompt: 'Prompt',
    settings: 'Settings',
    blocks: 'Blocks',
  },

  // Default layout configuration
  defaultLayout: {
    create: (api, panelIds, activeSlots) => {
      const hasAsset = activeSlots.includes('asset');
      const hasPrompt = activeSlots.includes('prompt');
      const hasSettings = activeSlots.includes('settings');
      const hasBlocks = activeSlots.includes('blocks');

      type AddPanelPosition = Parameters<DockviewApi['addPanel']>[0]['position'];

      const addPanelIfMissing = (
        slotName: QuickGenSlot,
        position?: AddPanelPosition
      ) => {
        const panelId = panelIds[slotName];
        if (!panelId || api.getPanel(panelId)) return;

        const titles: Record<QuickGenSlot, string> = {
          asset: 'Asset',
          prompt: 'Prompt',
          settings: 'Settings',
          blocks: 'Blocks',
        };

        api.addPanel({
          id: panelId,
          component: panelId,
          title: titles[slotName],
          position,
        });
      };

      // First panel (asset or prompt)
      const firstSlot: QuickGenSlot = hasAsset ? 'asset' : 'prompt';
      addPanelIfMissing(firstSlot);

      // Prompt (if not first, position right of asset)
      if (hasAsset && hasPrompt) {
        const assetPanel = api.getPanel(panelIds.asset);
        addPanelIfMissing(
          'prompt',
          assetPanel ? { direction: 'right', referencePanel: panelIds.asset } : undefined
        );
      }

      // Settings (right of prompt or asset)
      if (hasSettings) {
        const refPanel = api.getPanel(panelIds.prompt)
          ? panelIds.prompt
          : api.getPanel(panelIds.asset)
            ? panelIds.asset
            : undefined;

        addPanelIfMissing(
          'settings',
          refPanel ? { direction: 'right', referencePanel: refPanel } : undefined
        );
      }

      // Blocks (below prompt)
      if (hasBlocks && hasPrompt) {
        const promptPanel = api.getPanel(panelIds.prompt);
        addPanelIfMissing(
          'blocks',
          promptPanel ? { direction: 'below', referencePanel: panelIds.prompt } : undefined
        );
      }
    },

    resolvePosition: (slotName, _panelId, api, panelIds) => {
      switch (slotName) {
        case 'settings':
          if (api.getPanel(panelIds.prompt)) {
            return { direction: 'right', referencePanel: panelIds.prompt };
          }
          break;
        case 'blocks':
          if (api.getPanel(panelIds.prompt)) {
            return { direction: 'below', referencePanel: panelIds.prompt };
          }
          break;
      }
      return undefined;
    },
  },

  // UI behavior
  minPanelsForTabs: 1,
  enableContextMenu: true,
  persistLayout: true,
});

export default quickgenGroup;

// Re-export convenience constants for backward compatibility
export const QUICKGEN_PANEL_IDS = quickgenGroup.panels;
export const QUICKGEN_PRESETS = {
  promptSettings: quickgenGroup.getPanelIds('promptSettings'),
  full: quickgenGroup.getPanelIds('full'),
  fullWithBlocks: quickgenGroup.getPanelIds('fullWithBlocks'),
  promptSettingsBlocks: quickgenGroup.getPanelIds('promptSettingsBlocks'),
} as const;
