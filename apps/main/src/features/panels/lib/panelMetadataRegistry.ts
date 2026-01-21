/**
 * Panel Metadata Registry
 *
 * Metadata registry for panel orchestration system.
 * Defines interaction rules and zone behaviors for workspace panels.
 * Metadata now pulls from the plugin catalog to keep sources in sync.
 */

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { arePanelsInitialized, initializePanels } from './initializePanels';
import type { PanelMetadata } from './types';

export type { PanelMetadata } from './types';


function getRegistryPanelMetadata(): PanelMetadata[] {
  return panelSelectors
    .getAll()
    .filter((panel) => !!panel.orchestration)
    .map((panel) => ({
      id: panel.id,
      title: panel.title,
      ...panel.orchestration!,
    }));
}

/**
 * All panel metadata
 */
export function getAllPanelMetadata(): PanelMetadata[] {
  return getRegistryPanelMetadata();
}

/**
 * Panel metadata lookup by ID
 */
export function getPanelMetadataById(panelId: string): PanelMetadata | undefined {
  return getAllPanelMetadata().find((panel) => panel.id === panelId);
}

/**
 * Initialize all panels in the panel manager
 * Should be called once at app startup
 *
 * @param applySettings - Whether to apply user settings overrides (default: true)
 */
export async function registerAllPanels(applySettings = true) {
  try {
    const { panelManager } = await import('./PanelManager');

    if (!arePanelsInitialized()) {
      await initializePanels();
    }

    let metadata = getAllPanelMetadata();

    // Apply user settings overrides if enabled
    if (applySettings) {
      try {
        const { usePanelInteractionSettingsStore } = await import(
          '@features/settings'
        );
        const { applySettingsOverridesToAll } = await import('./applySettingsOverrides');

        const settings = usePanelInteractionSettingsStore.getState();
        metadata = applySettingsOverridesToAll(getAllPanelMetadata(), settings);

        console.log('[PanelMetadataRegistry] Applied user settings overrides');
      } catch (err) {
        console.warn('[PanelMetadataRegistry] Failed to apply settings, using defaults:', err);
      }
    }

    panelManager.registerPanels(metadata);
    console.log('[PanelMetadataRegistry] Registered', metadata.length, 'panels');

    return panelManager;
  } catch (err) {
    console.error('[PanelMetadataRegistry] Failed to register panels:', err);
    throw err;
  }
}

/**
 * Reload panels with updated settings
 * Call this when user changes panel interaction settings
 */
export async function reloadPanelsWithSettings() {
  try {
    const { panelManager } = await import('./PanelManager');
    const { usePanelInteractionSettingsStore } = await import(
      '@features/settings'
    );
    const { applySettingsOverridesToAll } = await import('./applySettingsOverrides');

    const settings = usePanelInteractionSettingsStore.getState();
    const metadata = applySettingsOverridesToAll(getAllPanelMetadata(), settings);

    // Re-register panels with updated metadata
    metadata.forEach(m => panelManager.registerPanel(m));

    console.log('[PanelMetadataRegistry] Reloaded panels with updated settings');
  } catch (err) {
    console.error('[PanelMetadataRegistry] Failed to reload panels:', err);
  }
}
