/**
 * Core helper registry implementation - pure TypeScript, no React/DOM dependencies.
 */

import type {
  HelperAdapter,
  HelperRegistry,
  HelperRegistryOptions,
  RegistryChangeListener,
  RegistryChangeEvent,
} from './types';

/**
 * Create a new helper registry instance.
 *
 * @typeParam K - Key type (typically a string union of valid keys)
 * @typeParam A - Adapter type (extends HelperAdapter)
 * @param options - Configuration options
 * @returns A new HelperRegistry instance
 *
 * @example
 * ```ts
 * // Create a typed registry for stat adapters
 * type StatSource = 'session.relationships' | 'session.stats' | 'derived';
 *
 * interface SessionStatAdapter extends HelperAdapter {
 *   source: StatSource;
 *   getSessionPath?: (entityId?: number) => string;
 * }
 *
 * const statAdapterRegistry = createHelperRegistry<StatSource, SessionStatAdapter>();
 *
 * // Register an adapter
 * statAdapterRegistry.register('session.relationships', {
 *   id: 'relationships',
 *   source: 'session.relationships',
 *   get: (session, npcId) => getNpcRelationshipState(session, npcId),
 *   set: (session, npcId, patch) => setNpcRelationshipState(session, npcId, patch),
 * });
 *
 * // Use the adapter
 * const adapter = statAdapterRegistry.get('session.relationships');
 * if (adapter) {
 *   const data = adapter.get(session, npcId);
 * }
 * ```
 */
export function createHelperRegistry<K extends string, A extends HelperAdapter>(
  options: HelperRegistryOptions = {}
): HelperRegistry<K, A> {
  const { warnOnOverwrite = true, strictMode = false } = options;

  const adapters = new Map<K, A>();
  const listeners = new Set<RegistryChangeListener<K, A>>();

  const notify = (event: RegistryChangeEvent<K, A>) => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[HelperRegistry] Listener error:', err);
      }
    });
  };

  const register = (key: K, adapter: A): (() => void) => {
    const existing = adapters.get(key);

    if (existing) {
      if (strictMode) {
        throw new Error(
          `[HelperRegistry] Adapter already registered for key "${key}". ` +
          `Use unregister() first or disable strictMode.`
        );
      }
      if (warnOnOverwrite) {
        console.warn(
          `[HelperRegistry] Overwriting adapter for key "${key}"`,
          { previous: existing.id, new: adapter.id }
        );
      }
    }

    adapters.set(key, adapter);
    notify({ type: 'register', key, adapter });

    return () => {
      // Only unregister if this adapter is still the registered one
      if (adapters.get(key) === adapter) {
        adapters.delete(key);
        notify({ type: 'unregister', key, adapter });
      }
    };
  };

  const get = (key: K): A | undefined => {
    return adapters.get(key);
  };

  const has = (key: K): boolean => {
    return adapters.has(key);
  };

  const getAll = (): Map<K, A> => {
    return new Map(adapters);
  };

  const keys = (): K[] => {
    return Array.from(adapters.keys());
  };

  const unregister = (key: K): boolean => {
    const adapter = adapters.get(key);
    if (adapter) {
      adapters.delete(key);
      notify({ type: 'unregister', key, adapter });
      return true;
    }
    return false;
  };

  const subscribe = (listener: RegistryChangeListener<K, A>): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    register,
    get,
    has,
    getAll,
    keys,
    unregister,
    subscribe,
  };
}
