/**
 * Built-in check registration
 *
 * Registers all default completeness check providers into a registry.
 * Called automatically when using `buildProjectManifest` with the default
 * singleton registry. Can also be called explicitly for custom registries.
 */

import type { CompletenessRegistry } from './registry';
import { registerBuiltinNpcChecks } from './npcCompleteness';
import { registerBuiltinLocationChecks } from './locationCompleteness';
import { registerBuiltinSceneChecks } from './sceneCompleteness';

/**
 * Register all built-in completeness check providers.
 *
 * Safe to call multiple times — providers are keyed by id, so
 * re-registration simply overwrites with the same function.
 */
export function registerAllBuiltins(registry: CompletenessRegistry): void {
  registerBuiltinNpcChecks(registry);
  registerBuiltinLocationChecks(registry);
  registerBuiltinSceneChecks(registry);
}
