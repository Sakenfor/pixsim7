/**
 * Media Settings Module
 *
 * Performance and storage settings for media handling.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerMediaSettings } from '../../lib/schemas/media.settings';

// Auto-register schema-based settings when module loads
registerMediaSettings();

export function MediaSettings() {
  return <DynamicSettingsPanel categoryId="media" />;
}

// Register this module
settingsRegistry.register({
  id: 'media',
  label: 'Media',
  component: MediaSettings,
  order: 40,
});
