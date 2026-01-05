/**
 * Core capability registry implementation - pure TypeScript, no React/DOM dependencies.
 */

import type {
  CapabilityKey,
  CapabilityProvider,
  CapabilityRegistry,
  CapabilityRegistryOptions,
  CapabilityConsumption,
} from "./types";

type ProviderEntry = {
  provider: CapabilityProvider;
  order: number;
  key: CapabilityKey;
};

/** Default throttle interval for consumption recording (ms) */
const DEFAULT_CONSUMPTION_THROTTLE_MS = 500;

/**
 * Create a new capability registry instance.
 *
 * @param options - Configuration options
 * @returns A new CapabilityRegistry instance
 *
 * @example
 * ```ts
 * const registry = createCapabilityRegistry();
 *
 * // Register a provider
 * const unsubscribe = registry.register("myCapability", {
 *   id: "myProvider",
 *   getValue: () => ({ data: "value" }),
 * });
 *
 * // Get the best provider
 * const provider = registry.getBest("myCapability");
 * if (provider) {
 *   const value = provider.getValue();
 * }
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export function createCapabilityRegistry(
  options: CapabilityRegistryOptions = {}
): CapabilityRegistry {
  let consumptionThrottleMs = options.consumptionThrottleMs ?? DEFAULT_CONSUMPTION_THROTTLE_MS;

  const providers = new Map<CapabilityKey, ProviderEntry[]>();
  const listeners = new Set<() => void>();
  let orderCounter = 0;

  // Consumption tracking: Map<key, Map<consumerScopeId, record>>
  const consumption = new Map<CapabilityKey, Map<string, CapabilityConsumption>>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const register = <T>(
    key: CapabilityKey,
    provider: CapabilityProvider<T>
  ): (() => void) => {
    const entry: ProviderEntry = { provider, order: orderCounter++, key };
    const list = providers.get(key) ?? [];
    list.push(entry);
    providers.set(key, list);
    notify();

    return () => {
      const current = providers.get(key);
      if (!current) {
        return;
      }

      const next = current.filter((item) => item !== entry);
      if (next.length === 0) {
        providers.delete(key);
      } else {
        providers.set(key, next);
      }
      notify();
    };
  };

  const getAll = <T>(key: CapabilityKey): CapabilityProvider<T>[] => {
    const list = providers.get(key) ?? [];
    return list.map((entry) => entry.provider) as CapabilityProvider<T>[];
  };

  const getExposedKeys = (): CapabilityKey[] => {
    const keys = new Set<CapabilityKey>();
    for (const entryList of providers.values()) {
      for (const entry of entryList) {
        if (entry.provider.exposeToContextMenu) {
          keys.add(entry.key);
        }
      }
    }
    return Array.from(keys);
  };

  const getKeys = (): CapabilityKey[] => {
    return Array.from(providers.keys());
  };

  const getBest = <T>(key: CapabilityKey): CapabilityProvider<T> | null => {
    const list = providers.get(key);
    if (!list || list.length === 0) {
      return null;
    }

    let best: ProviderEntry | null = null;
    for (const entry of list) {
      const provider = entry.provider;
      if (provider.isAvailable && !provider.isAvailable()) {
        continue;
      }
      if (!best) {
        best = entry;
        continue;
      }
      const bestPriority = best.provider.priority ?? 0;
      const nextPriority = provider.priority ?? 0;
      if (nextPriority > bestPriority) {
        best = entry;
      } else if (nextPriority === bestPriority && entry.order > best.order) {
        best = entry;
      }
    }

    return (best?.provider as CapabilityProvider<T>) ?? null;
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // =========================================================================
  // Consumption tracking (for debugging/visualization)
  // =========================================================================

  const recordConsumption = (
    key: CapabilityKey,
    consumerScopeId: string,
    provider: Pick<CapabilityProvider, "id" | "label"> | null
  ): void => {
    if (!consumerScopeId) return;

    const now = Date.now();
    let keyMap = consumption.get(key);
    if (!keyMap) {
      keyMap = new Map();
      consumption.set(key, keyMap);
    }

    const existing = keyMap.get(consumerScopeId);
    // Throttle: only update if past the configured interval since last
    if (
      existing &&
      consumptionThrottleMs > 0 &&
      now - existing.lastSeenAt < consumptionThrottleMs
    ) {
      return;
    }

    keyMap.set(consumerScopeId, {
      key,
      consumerScopeId,
      providerId: provider?.id ?? "none",
      providerLabel: provider?.label,
      lastSeenAt: now,
    });
  };

  const getConsumers = (key: CapabilityKey): CapabilityConsumption[] => {
    const keyMap = consumption.get(key);
    if (!keyMap) return [];
    return Array.from(keyMap.values());
  };

  const getConsumptionForScope = (scopeId: string): CapabilityConsumption[] => {
    const results: CapabilityConsumption[] = [];
    for (const keyMap of consumption.values()) {
      const record = keyMap.get(scopeId);
      if (record) {
        results.push(record);
      }
    }
    return results;
  };

  const getAllConsumption = (): CapabilityConsumption[] => {
    const results: CapabilityConsumption[] = [];
    for (const keyMap of consumption.values()) {
      for (const record of keyMap.values()) {
        results.push(record);
      }
    }
    return results;
  };

  const clearConsumptionForScope = (scopeId: string): void => {
    for (const keyMap of consumption.values()) {
      keyMap.delete(scopeId);
    }
    // Notify listeners so consumers can update
    notify();
  };

  const setConsumptionThrottleMs = (ms: number): void => {
    consumptionThrottleMs = Math.max(0, ms);
  };

  const getConsumptionThrottleMs = (): number => {
    return consumptionThrottleMs;
  };

  return {
    register,
    getBest,
    getAll,
    getKeys,
    getExposedKeys,
    subscribe,
    // Consumption tracking
    recordConsumption,
    getConsumers,
    getConsumptionForScope,
    getAllConsumption,
    clearConsumptionForScope,
    setConsumptionThrottleMs,
    getConsumptionThrottleMs,
  };
}
