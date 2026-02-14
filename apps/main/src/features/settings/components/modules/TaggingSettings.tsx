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

function TagsGeneralSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="tags" tabId="general" />
    </div>
  );
}

function TagsAutoTaggingSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="tags" tabId="auto-tagging" />
    </div>
  );
}

function TagsAnalysisSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="tags" tabId="analysis" />
    </div>
  );
}

/** Default component - shows general settings (first sub-section) */
export function TaggingSettings() {
  return <TagsGeneralSettings />;
}

// Register in component registry for sidebar navigation
settingsRegistry.register({
  id: 'tags',
  label: 'Tags',
  icon: '🏷️',
  component: TaggingSettings,
  order: 45,
  subSections: [
    {
      id: 'general',
      label: 'General',
      icon: '🏷️',
      component: TagsGeneralSettings,
    },
    {
      id: 'auto-tagging',
      label: 'Auto-Tagging',
      icon: '🤖',
      component: TagsAutoTaggingSettings,
    },
    {
      id: 'analysis',
      label: 'Analysis',
      icon: '🔍',
      component: TagsAnalysisSettings,
    },
  ],
});

// Alias for clearer naming
export { TaggingSettings as TagsSettings };
