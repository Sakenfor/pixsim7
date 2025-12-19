/**
 * Panel Metadata Registry
 *
 * Metadata registry for panel orchestration system.
 * Defines interaction rules and zone behaviors for workspace panels.
 * Metadata now pulls from the panel registry to keep sources in sync.
 */

import type { PanelMetadata } from './types';
import { panelRegistry } from './panelRegistry';
import { arePanelsInitialized, initializePanels } from './initializePanels';

/**
 * Control Center Panel
 * - Contains QuickGenerate dockview
 * - Retracts when Asset Viewer opens
 * - Lives in left sidebar
 */
export const CONTROL_CENTER_METADATA: PanelMetadata = {
  id: 'controlCenter',
  title: 'Control Center',
  type: 'dockview-container',
  defaultZone: 'left',
  canChangeZone: false,

  retraction: {
    canRetract: true,
    retractedWidth: 48,  // Icon bar width
    animationDuration: 200,
  },

  dockview: {
    hasDockview: true,
    subPanelRegistry: 'quickGenPanelRegistry',
    subPanelsCanBreakout: false,  // QuickGen sub-panels stay internal
    persistLayout: true,
    storageKey: 'quickGenerate-dockview-layout',
  },

  priority: 40,

  interactionRules: {
    whenOpens: {
      assetViewer: 'retract',  // Retract when viewer opens
      gallery: 'nothing',      // Don't react to gallery
    },
    whenCloses: {
      assetViewer: 'expand',   // Expand when viewer closes
    },
  },
};

/**
 * Asset Viewer Panel
 * - Contains media preview, metadata, and quick generate
 * - High priority, takes center stage
 * - Can float/pop out
 */
export const ASSET_VIEWER_METADATA: PanelMetadata = {
  id: 'assetViewer',
  title: 'Asset Viewer',
  type: 'dockview-container',
  defaultZone: 'center',
  canChangeZone: true,  // Can pop out to floating window

  dockview: {
    hasDockview: true,
    subPanelRegistry: 'viewerPanelRegistry',
    subPanelsCanBreakout: true,  // Sub-panels can pop out
    persistLayout: true,
    storageKey: 'asset-viewer-dockview-layout',
  },

  priority: 80,  // High priority - gets space preference

  // Asset viewer can trigger control center retraction
  // (handled by control center's whenOpens rule)
};

const EXTERNAL_PANEL_METADATA: PanelMetadata[] = [
  CONTROL_CENTER_METADATA,
  ASSET_VIEWER_METADATA,
];

function getRegistryPanelMetadata(): PanelMetadata[] {
  return panelRegistry
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
  const merged = new Map<string, PanelMetadata>();
  for (const panel of getRegistryPanelMetadata()) {
    merged.set(panel.id, panel);
  }
  for (const panel of EXTERNAL_PANEL_METADATA) {
    if (!merged.has(panel.id)) {
      merged.set(panel.id, panel);
    }
  }
  return Array.from(merged.values());
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
          '@features/settings/stores/panelInteractionSettingsStore'
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
      '@features/settings/stores/panelInteractionSettingsStore'
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
