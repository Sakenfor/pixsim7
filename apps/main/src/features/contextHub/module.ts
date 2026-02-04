/**
 * Context Hub Module
 *
 * Manages the capability system for context-aware UI behavior.
 * Provides capability routing, context menu integration, and settings.
 *
 * Key responsibilities:
 * - Capability provider/consumer infrastructure
 * - Context menu capability filtering (requiredCapabilities)
 * - Settings for context hub behavior
 */

import { contextMenuRegistry } from '@pixsim7/shared.ui.context-menu';

import { registerContextSettings } from '@features/settings/lib/schemas/context.settings';

import type { Module } from '@app/modules/types';


import { useContextHubSettingsStore } from './stores/contextHubSettingsStore';

// Import to ensure capability descriptors are registered
import './domain/capabilities';

let settingsUnregister: (() => void) | null = null;
let settingsUnsubscribe: (() => void) | null = null;

/**
 * Context Hub Module
 *
 * Core infrastructure for capability-based context awareness.
 * Should initialize early as other modules may depend on capabilities.
 */
export const contextHubModule: Module = {
  id: 'context-hub',
  name: 'Context Hub',
  priority: 80, // High priority - capabilities are infrastructure

  async initialize() {
    // Register context hub settings
    settingsUnregister = registerContextSettings();

    // Sync capability filtering setting with registry
    const syncCapabilityFiltering = (enabled: boolean) => {
      contextMenuRegistry.setCapabilityFilteringEnabled(enabled);
    };

    // Initial sync
    syncCapabilityFiltering(useContextHubSettingsStore.getState().enableCapabilityFiltering);

    // Subscribe to changes
    settingsUnsubscribe = useContextHubSettingsStore.subscribe(
      (state) => state.enableCapabilityFiltering,
      syncCapabilityFiltering
    );
  },

  cleanup() {
    if (settingsUnregister) {
      settingsUnregister();
      settingsUnregister = null;
    }
    if (settingsUnsubscribe) {
      settingsUnsubscribe();
      settingsUnsubscribe = null;
    }
  },

  isReady: () => true,
};
