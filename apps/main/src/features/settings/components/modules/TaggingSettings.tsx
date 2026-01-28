/**
 * Tags Settings Module
 *
 * Comprehensive tag settings: display, auto-tagging, and analysis.
 */
import { registerTaggingSettings } from '../../lib/schemas/tagging.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerTaggingSettings();

export function TaggingSettings() {
  return <DynamicSettingsPanel categoryId="tags" />;
}

// Alias for clearer naming
export { TaggingSettings as TagsSettings };
