/**
 * Generation Settings Module (Bridge Pattern)
 *
 * Configure retry behavior and other generation-related defaults.
 * Uses DynamicSettingsPanel with schema from generation.settings.tsx.
 */
import { settingsRegistry } from '../../lib/core/registry';
import { registerGenerationSettings } from '../../lib/schemas/generation.settings';
import { registerPrimitiveProjectionSettings } from '../../lib/schemas/primitive_projection.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerGenerationSettings();
// Primitive-projection LLM-fallback admin group — own server-config adapter,
// same 'generation' category so it co-renders with the LLM Cache admin group.
registerPrimitiveProjectionSettings();

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

