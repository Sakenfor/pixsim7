/**
 * Gallery Settings Module
 *
 * User preferences for gallery display behavior.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerGallerySettings } from '../../lib/schemas/gallery.settings';

// Auto-register schema-based settings when module loads
registerGallerySettings();

export function GallerySettings() {
  return <DynamicSettingsPanel categoryId="gallery" />;
}

// Register this module
settingsRegistry.register({
  id: 'gallery',
  label: 'Gallery',
  component: GallerySettings,
  order: 45,
});
