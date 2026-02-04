/**
 * Generation Settings Module (Bridge Pattern)
 *
 * Configure retry behavior and other generation-related defaults.
 * Uses DynamicSettingsPanel with schema from generation.settings.tsx.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { registerGenerationSettings } from '../../lib/schemas/generation.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerGenerationSettings();

export function GenerationSettings() {
  return <DynamicSettingsPanel categoryId="generation" />;
}

// Register this module
settingsRegistry.register({
  id: 'generation',
  label: 'Generation',
  icon: '⚡',
  component: GenerationSettings,
  order: 32,
});

