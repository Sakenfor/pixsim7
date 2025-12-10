/**
 * Media Settings Module
 *
 * Performance and storage settings for media handling.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '@/lib/settingsRegistry';
import { DynamicSettingsPanel } from '@/lib/settings';
import { registerMediaSettings } from '@/lib/settings/media.settings';

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
