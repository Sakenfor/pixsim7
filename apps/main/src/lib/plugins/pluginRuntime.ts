import { familyAdapters, type PluginRegistrationContext, type PluginTypeMap } from './familyAdapters';
import { pluginSettingsRegistry } from './pluginSettingsRegistry';
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
  const registrationDecision = await shouldRegisterPlugin(definition.id);
  if (!registrationDecision.allowed) {
    console.info(`[PluginRuntime] Skipping disabled plugin ${definition.id}: ${registrationDecision.reason}`);
    return;
  }

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

  // Auto-register settings schema (from adapter or from plugin object itself)
  const pluginObj = definition.plugin as Record<string, unknown>;
  const schema = adapter.getSettingsSchema?.(definition.plugin)
    ?? (Array.isArray(pluginObj.settingsSchema) ? pluginObj.settingsSchema as import('@lib/settingsSchema/types').SettingGroup[] : undefined);
  if (schema) {
    pluginSettingsRegistry.register(metadata.id, schema);
  }

  await adapter.register(definition.plugin, context);
}

export async function registerPluginDefinitions(definitions: PluginDefinition[]): Promise<void> {
  for (const definition of definitions) {
    await registerPluginDefinition(definition);
  }
}

async function shouldRegisterPlugin(
  pluginId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { usePluginCatalogStore } = await import('@/stores/pluginCatalogStore');
    const state = usePluginCatalogStore.getState();

    // Fail-open when backend catalog is unavailable or not initialized yet.
    if (!state.isInitialized || !state.isApiAvailable) {
      return { allowed: true };
    }

    const backendEntry = state.plugins.find((plugin) => plugin.plugin_id === pluginId);
    if (!backendEntry) {
      return { allowed: true };
    }

    if (backendEntry.is_required) {
      return { allowed: true };
    }

    if (!backendEntry.is_enabled) {
      return { allowed: false, reason: 'disabled in backend catalog' };
    }

    return { allowed: true };
  } catch {
    // Fail-open on any integration issue to preserve current behavior.
    return { allowed: true };
  }
}
