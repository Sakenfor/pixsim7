/**
 * Context Settings Module
 *
 * Settings for context hub behavior and capability routing.
 * Uses the schema-driven DynamicSettingsPanel for rendering.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

export function ContextSettings() {
  return <DynamicSettingsPanel categoryId="context" />;
}

// Register this module
settingsRegistry.register({
  id: 'context',
  label: 'Context',
  icon: '🔗',
  component: ContextSettings,
  order: 60,
});
