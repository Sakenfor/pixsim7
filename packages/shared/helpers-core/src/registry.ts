/**
 * Core helper registry implementation - pure TypeScript, no React/DOM dependencies.
 */

import type {
  HelperAdapter,
  HelperRegistry,
  HelperRegistryOptions,
  Registry,
  RegistryOptions,
  RegistryChangeListener,
  RegistryChangeEvent,
} from './types';

/**
 * Create a new generic registry instance.
 *
 * @typeParam K - Key type (typically a string union of valid keys)
 * @typeParam V - Value type
 * @param options - Configuration options
 * @returns A new Registry instance
 */
export function createRegistry<K extends string, V>(
  options: RegistryOptions<V> = {}
): Registry<K, V> {
  const {
    warnOnOverwrite = true,
    strictMode = false,
    onDuplicate,
    label = 'Registry',
  } = options;

  const entries = new Map<K, V>();
  const listeners = new Set<RegistryChangeListener<K, V>>();

  const notify = (event: RegistryChangeEvent<K, V>) => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error(`[${label}] Listener error:`, err);
      }
    });
  };

  const register = (key: K, value: V): (() => void) => {
    const hasExisting = entries.has(key);
    const existing = hasExisting ? (entries.get(key) as V) : undefined;

    if (hasExisting) {
      if (strictMode) {
        throw new Error(
          `[${label}] Entry already registered for key "${key}". ` +
          'Use unregister() first or disable strictMode.'
        );
      }
      if (onDuplicate) {
        onDuplicate(value, existing as V);
      }
      if (warnOnOverwrite) {
        console.warn(`[${label}] Overwriting entry for key "${key}"`);
      }
    }

    entries.set(key, value);
    notify({ type: 'register', key, value });

    return () => {
      if (entries.get(key) === value) {
        entries.delete(key);
        notify({ type: 'unregister', key, value });
      }
    };
  };

  const get = (key: K): V | undefined => {
    return entries.get(key);
  };

  const has = (key: K): boolean => {
    return entries.has(key);
  };

  const getAll = (): Map<K, V> => {
    return new Map(entries);
  };

  const keys = (): K[] => {
    return Array.from(entries.keys());
  };

  const unregister = (key: K): boolean => {
    if (!entries.has(key)) {
      return false;
    }
    const value = entries.get(key) as V;
    entries.delete(key);
    notify({ type: 'unregister', key, value });
    return true;
  };

  const subscribe = (listener: RegistryChangeListener<K, V>): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const clear = (): void => {
    if (entries.size === 0) {
      return;
    }

    const snapshot = Array.from(entries.entries());
    entries.clear();
    snapshot.forEach(([key, value]) => {
      notify({ type: 'unregister', key, value });
    });
  };

  return {
    register,
    get,
    has,
    getAll,
    keys,
    unregister,
    subscribe,
    clear,
  };
}

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
  options: HelperRegistryOptions<A> = {}
): HelperRegistry<K, A> {
  return createRegistry<K, A>({
    ...options,
    label: options.label ?? 'HelperRegistry',
  });
}
