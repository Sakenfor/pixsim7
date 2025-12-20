import type { CapabilityKey, CapabilityProvider, CapabilityRegistry } from "./types";

type ProviderEntry = {
  provider: CapabilityProvider;
  order: number;
  key: CapabilityKey;
};

export function createCapabilityRegistry(): CapabilityRegistry {
  const providers = new Map<CapabilityKey, ProviderEntry[]>();
  const listeners = new Set<() => void>();
  let orderCounter = 0;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const register = <T,>(key: CapabilityKey, provider: CapabilityProvider<T>) => {
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

  const getAll = <T,>(key: CapabilityKey): CapabilityProvider<T>[] => {
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

  const getBest = <T,>(key: CapabilityKey): CapabilityProvider<T> | null => {
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

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    register,
    getBest,
    getAll,
    getKeys,
    getExposedKeys,
    subscribe,
  };
}
