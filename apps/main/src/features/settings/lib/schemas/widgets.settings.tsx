/**
 * Widget Settings Schema (Auto-Generated)
 *
 * Auto-generates settings tabs from widgets that have settingsSchema defined.
 */

import { createWidgetSettingsRegistration } from '@lib/widgets';

import { settingsSchemaRegistry } from '../core';

// =============================================================================
// Registration
// =============================================================================

/**
 * Register widget settings from all widgets that have settingsSchema defined.
 * Called once during app initialization.
 */
export function registerWidgetSettings(): () => void {
  const registration = createWidgetSettingsRegistration();
  if (!registration || registration.tabs.length === 0) {
    return () => {};
  }

  const { tabs, useStore } = registration;
  const unregisterFns: Array<() => void> = [];

  const [firstTab, ...remainingTabs] = tabs;

  const unregisterFirst = settingsSchemaRegistry.register({
    categoryId: 'workspace',
    tab: firstTab,
    useStore,
  });
  unregisterFns.push(unregisterFirst);

  for (const tab of remainingTabs) {
    const unregister = settingsSchemaRegistry.register({
      categoryId: 'workspace',
      tab,
      useStore,
    });
    unregisterFns.push(unregister);
  }

  return () => {
    unregisterFns.forEach((fn) => fn());
  };
}

export { getWidgetsWithSettings } from '@lib/widgets';
