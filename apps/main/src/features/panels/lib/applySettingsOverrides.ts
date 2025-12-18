/**
 * Apply Settings Overrides
 *
 * Utilities for applying user settings overrides to panel metadata.
 */

import type { PanelMetadata } from './types';
import type { PanelInteractionSettingsState } from '@features/settings/stores/panelInteractionSettingsStore';

/**
 * Apply user settings overrides to panel metadata
 */
export function applySettingsOverrides(
  metadata: PanelMetadata,
  settings: PanelInteractionSettingsState
): PanelMetadata {
  const panelSettings = settings.panelSettings[metadata.id];

  // No overrides for this panel
  if (!panelSettings?.interactionOverrides) {
    return metadata;
  }

  // Clone metadata to avoid mutations
  const cloned: PanelMetadata = {
    ...metadata,
    interactionRules: metadata.interactionRules
      ? {
          whenOpens: { ...metadata.interactionRules.whenOpens },
          whenCloses: { ...metadata.interactionRules.whenCloses },
        }
      : { whenOpens: {}, whenCloses: {} },
  };

  // Apply overrides
  Object.entries(panelSettings.interactionOverrides).forEach(([targetPanelId, override]) => {
    if (override.whenOpens) {
      cloned.interactionRules!.whenOpens![targetPanelId] = override.whenOpens;
    }
    if (override.whenCloses) {
      cloned.interactionRules!.whenCloses![targetPanelId] = override.whenCloses;
    }
  });

  // Apply animation duration override if settings has global override
  if (cloned.retraction && settings.globalAnimationDuration !== 200) {
    cloned.retraction = {
      ...cloned.retraction,
      animationDuration: settings.globalAnimationDuration,
    };
  }

  // Apply preferred zone if set
  if (panelSettings.preferredZone) {
    cloned.defaultZone = panelSettings.preferredZone;
  }

  return cloned;
}

/**
 * Apply settings overrides to all panel metadata
 */
export function applySettingsOverridesToAll(
  metadataList: PanelMetadata[],
  settings: PanelInteractionSettingsState
): PanelMetadata[] {
  return metadataList.map(metadata => applySettingsOverrides(metadata, settings));
}

/**
 * Check if automatic interactions are enabled in settings
 */
export function shouldApplyInteractions(settings: PanelInteractionSettingsState): boolean {
  return settings.enableAutomaticInteractions;
}
