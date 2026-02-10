import { familyAdapters, type PluginRegistrationContext, type PluginTypeMap } from './familyAdapters';
import type {
  ActivationState,
  PluginFamily,
  PluginMetadata,
  PluginOrigin,
} from './pluginSystem';
import { pluginCatalog } from './pluginSystem';
import type { PluginRegistrationSource } from './registration';
import { fromPluginSystemMetadata, validateFamilyMetadata } from './types';

export interface PluginDefinition<F extends PluginFamily = PluginFamily> {
  id: string;
  family: F;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  plugin: PluginTypeMap[F];
  label?: string;
  activationState?: ActivationState;
  canDisable?: boolean;
  metadata?: Partial<PluginMetadata>;
}

export async function registerPluginDefinition<F extends PluginFamily>(definition: PluginDefinition<F>): Promise<void> {
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
  pluginCatalog.registerWithPlugin(metadata, definition.plugin);
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
