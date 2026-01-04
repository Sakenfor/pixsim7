/**
 * Generation Settings Module
 *
 * Configure retry behavior and other generation-related defaults.
 * Uses schema-driven settings system with auto-registration.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';
import { registerGenerationSettings } from '../../lib/schemas/generation.settings';

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

