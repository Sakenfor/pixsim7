/**
 * Tags Settings Module (Bridge Pattern)
 *
 * Comprehensive tag settings: display, auto-tagging, and analysis.
 * Uses DynamicSettingsPanel with schema from tagging.settings.tsx.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { registerTaggingSettings } from '../../lib/schemas/tagging.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerTaggingSettings();

export function TaggingSettings() {
  return <DynamicSettingsPanel categoryId="tags" />;
}

// Register in component registry for sidebar navigation
settingsRegistry.register({
  id: 'tags',
  label: 'Tags',
  icon: '🏷️',
  component: TaggingSettings,
  order: 45,
});

// Alias for clearer naming
export { TaggingSettings as TagsSettings };
