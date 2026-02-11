/**
 * Completeness Registry
 *
 * Features/packages register check providers here.  The project manifest
 * builder runs whatever is registered to produce health reports.
 *
 * Built-in checks are registered via `registerAllBuiltins()`.
 * Features can add, replace, or remove individual providers at any time.
 *
 * @example
 * ```typescript
 * import { completenessRegistry } from '@pixsim7/core.authoring';
 *
 * // Register a custom NPC check from a feature
 * completenessRegistry.register('npc', 'myFeature.dialogueReady', (npc) => [{
 *   id: 'npc.dialogueReady',
 *   label: 'Has greeting dialogue',
 *   status: npc.meta?.greetingDialogueId ? 'complete' : 'incomplete',
 * }]);
 * ```
 */

import type { CompletenessCheck } from './types';

/**
 * A function that inspects one entity and returns zero or more checks.
 *
 * Generic over the input type so NPC providers receive `NpcAuthoringInput`,
 * location providers receive `LocationAuthoringInput`, etc.
 */
export type CheckProvider<T = unknown> = (input: T) => CompletenessCheck[];

export interface CompletenessRegistry {
  /**
   * Register a check provider for an entity type.
   *
   * @param entityType - 'npc' | 'location' | 'scene' (or custom)
   * @param providerId - Unique id scoped to entityType (e.g. 'core.portrait')
   * @param provider   - Function that returns checks for one entity
   */
  register<T>(entityType: string, providerId: string, provider: CheckProvider<T>): void;

  /** Remove a previously registered provider. */
  unregister(entityType: string, providerId: string): void;

  /** Run all registered providers for `entityType` against `input`. */
  runChecks<T>(entityType: string, input: T): CompletenessCheck[];

  /** List registered provider ids for an entity type. */
  getProviderIds(entityType: string): string[];

  /** Remove all providers (useful for testing). */
  clear(): void;
}

/**
 * Create a fresh registry instance.
 *
 * Most callers should use the default `completenessRegistry` singleton,
 * but `createCompletenessRegistry()` is useful for tests or isolated contexts.
 */
export function createCompletenessRegistry(): CompletenessRegistry {
  const providers = new Map<string, Map<string, CheckProvider>>();

  return {
    register<T>(entityType: string, providerId: string, provider: CheckProvider<T>) {
      if (!providers.has(entityType)) providers.set(entityType, new Map());
      providers.get(entityType)!.set(providerId, provider as CheckProvider);
    },

    unregister(entityType: string, providerId: string) {
      providers.get(entityType)?.delete(providerId);
    },

    runChecks<T>(entityType: string, input: T): CompletenessCheck[] {
      const typeProviders = providers.get(entityType);
      if (!typeProviders) return [];
      const checks: CompletenessCheck[] = [];
      for (const provider of typeProviders.values()) {
        checks.push(...provider(input));
      }
      return checks;
    },

    getProviderIds(entityType: string): string[] {
      return [...(providers.get(entityType)?.keys() ?? [])];
    },

    clear() {
      providers.clear();
    },
  };
}

/** Default singleton registry. */
export const completenessRegistry: CompletenessRegistry = createCompletenessRegistry();
