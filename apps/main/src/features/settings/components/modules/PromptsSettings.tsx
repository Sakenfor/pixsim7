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

/** Analysis settings tab */
function PromptsAnalysisSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="prompts" tabId="analysis" />
    </div>
  );
}

/** Block extraction settings tab */
function PromptsExtractionSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="prompts" tabId="extraction" />
    </div>
  );
}

/** Default component - shows analysis settings */
export function PromptsSettings() {
  return <PromptsAnalysisSettings />;
}

// Register this module with sub-sections
settingsRegistry.register({
  id: 'prompts',
  label: 'Prompts',
  icon: '📝',
  component: PromptsSettings,
  order: 35,
  subSections: [
    {
      id: 'analysis',
      label: 'Analysis',
      icon: '🔍',
      component: PromptsAnalysisSettings,
    },
    {
      id: 'extraction',
      label: 'Block Extraction',
      icon: '📦',
      component: PromptsExtractionSettings,
    },
  ],
});
