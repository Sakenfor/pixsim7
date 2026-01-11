import { familyAdapters, type PluginRegistrationContext } from './familyAdapters';
import type {
  ActivationState,
  PluginFamily,
  PluginMetadata,
  PluginOrigin,
} from './pluginSystem';
import { pluginCatalog } from './pluginSystem';
import type { PluginRegistrationSource } from './registration';
import { fromPluginSystemMetadata, validateFamilyMetadata } from './types';

export interface PluginDefinition {
  id: string;
  family: PluginFamily;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  plugin: any;
  label?: string;
  activationState?: ActivationState;
  canDisable?: boolean;
  metadata?: Partial<PluginMetadata>;
}

export async function registerPluginDefinition(definition: PluginDefinition): Promise<void> {
  const adapter = familyAdapters[definition.family];
  if (!adapter) {
    throw new Error(`No plugin adapter registered for family: ${definition.family}`);
  }

  const context: PluginRegistrationContext = {
    id: definition.id,
    family: definition.family,
    origin: definition.origin,
    source: definition.source,
    activationState: definition.activationState,
    canDisable: definition.canDisable,
    metadata: definition.metadata,
  };

  const metadata = adapter.buildMetadata(definition.plugin, context);
  pluginCatalog.register(metadata);
  const descriptor = fromPluginSystemMetadata(metadata);
  const validation = validateFamilyMetadata(descriptor);
  if (!validation.valid) {
    console.error(`[PluginRuntime] Plugin ${metadata.id} has validation errors:`, validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn(`[PluginRuntime] Plugin ${metadata.id} has validation warnings:`, validation.warnings);
  }
  await adapter.register(definition.plugin, context);
}

export async function registerPluginDefinitions(definitions: PluginDefinition[]): Promise<void> {
  for (const definition of definitions) {
    await registerPluginDefinition(definition);
  }
}
