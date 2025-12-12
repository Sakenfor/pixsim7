/**
 * Prompts Settings Module
 *
 * Configure prompt analysis, block extraction, and curation workflows.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerPromptSettings } from '../../lib/schemas/prompts.settings';

// Auto-register schema-based settings when module loads
registerPromptSettings();

export function PromptsSettings() {
  return <DynamicSettingsPanel categoryId="prompts" />;
}

// Register this module
settingsRegistry.register({
  id: 'prompts',
  label: 'Prompts',
  icon: '📝',
  component: PromptsSettings,
  order: 35, // After General (10), UI (20), Panels (30)
});
