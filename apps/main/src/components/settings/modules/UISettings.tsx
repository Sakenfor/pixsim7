/**
 * UI Settings Module
 *
 * Visual and interaction settings for the application UI.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '@/lib/settingsRegistry';
import { DynamicSettingsPanel } from '@/lib/settings';
import { registerUISettings } from '@/lib/settings/ui.settings.js';

// Auto-register schema-based settings when module loads
registerUISettings();

export function UISettings() {
  return <DynamicSettingsPanel categoryId="ui" />;
}

// Register this module with the settings panel
settingsRegistry.register({
  id: 'ui',
  label: 'UI',
  icon: '🎨',
  component: UISettings,
  order: 15,
});
