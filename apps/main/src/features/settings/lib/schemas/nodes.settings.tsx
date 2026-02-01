/**
 * Node Settings Schema (Auto-Generated)
 *
 * Auto-generates settings tabs from node types that have settingsSchema defined.
 */

import { createNodeSettingsRegistration } from '@lib/nodeSettings';

import { settingsSchemaRegistry } from '../core';

// =============================================================================
// Registration
// =============================================================================

/**
 * Register node settings from all node types that have settingsSchema defined.
 * Called once during app initialization.
 */
export function registerNodeSettings(): () => void {
  const registration = createNodeSettingsRegistration();
  if (!registration || registration.tabs.length === 0) {
    return () => {};
  }

  const { tabs, useStore } = registration;
  const unregisterFns: Array<() => void> = [];

  const [firstTab, ...remainingTabs] = tabs;

  const unregisterFirst = settingsSchemaRegistry.register({
    categoryId: 'nodes',
    category: {
      label: 'Nodes',
      icon: '🔷',
      order: 26, // After Widgets (25), before Library (35)
    },
    tab: firstTab,
    useStore,
  });
  unregisterFns.push(unregisterFirst);

  for (const tab of remainingTabs) {
    const unregister = settingsSchemaRegistry.register({
      categoryId: 'nodes',
      tab,
      useStore,
    });
    unregisterFns.push(unregister);
  }

  return () => {
    unregisterFns.forEach((fn) => fn());
  };
}

export {
  getNodeTypesWithSettings,
  getNodeTypeSettings,
  useNodeSettingsStore,
} from '@lib/nodeSettings';
