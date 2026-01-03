import type { ExtendedPluginMetadata } from './pluginSystem';
import { fromPluginSystemMetadata, validateFamilyMetadata } from './types';

export async function registerCatalogMetadata(
  metadata: ExtendedPluginMetadata,
  context: string
): Promise<void> {
  const { pluginCatalog } = await import('./pluginSystem');
  pluginCatalog.register(metadata);

  const descriptor = fromPluginSystemMetadata(metadata);
  const validation = validateFamilyMetadata(descriptor);
  if (!validation.valid) {
    console.error(`[${context}] Plugin ${metadata.id} has validation errors:`, validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn(`[${context}] Plugin ${metadata.id} has validation warnings:`, validation.warnings);
  }
}

export async function unregisterCatalogMetadata(id: string): Promise<void> {
  const { pluginCatalog } = await import('./pluginSystem');
  pluginCatalog.unregister(id);
}
