/**
 * Register Console Manifest
 *
 * Shared loader that processes manifest declarations and registers
 * categories, operations, and data stores with the appropriate registries.
 */

import { dataRegistry } from '../dataRegistry';
import { opsRegistry } from '../opsRegistry';

import type { ConsoleManifest } from './types';

/**
 * Register a console manifest
 *
 * Processes static declarations (categories, operations, data stores)
 * then calls the dynamic register function if provided.
 *
 * @param manifest - The manifest to register
 */
export function registerConsoleManifest(manifest: ConsoleManifest): void | Promise<void> {
  // 1. Register categories
  if (manifest.ops?.categories) {
    for (const category of manifest.ops.categories) {
      opsRegistry.registerCategory(category.id, category.name, category.description);
    }
  }

  // 2. Register operations
  if (manifest.ops?.operations) {
    for (const { categoryId, op } of manifest.ops.operations) {
      opsRegistry.register(categoryId, op);
    }
  }

  // 3. Register data stores
  if (manifest.data) {
    for (const store of manifest.data) {
      dataRegistry.register(store);
    }
  }

  // 4. Call dynamic register if provided
  if (manifest.register) {
    return manifest.register({ opsRegistry, dataRegistry });
  }
}

/**
 * Register multiple console manifests in order
 *
 * @param manifests - Manifests to register (in dependency order)
 */
export async function registerConsoleManifests(manifests: ConsoleManifest[]): Promise<void> {
  for (const manifest of manifests) {
    const result = registerConsoleManifest(manifest);
    if (result instanceof Promise) {
      await result;
    }
  }
}
