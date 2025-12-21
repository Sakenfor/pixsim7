import type { DependencyList } from "react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  CapabilityKey,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityScope,
} from "./types";
import { useContextHubState, useContextHubHostId } from "./ContextHubHost";
import type { ContextHubState } from "./ContextHubHost";
import { useContextHubOverridesStore } from "./store/contextHubOverridesStore";

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

function getRegistryChain(root: ContextHubState | null) {
  const registries = [];
  let current = root;
  while (current) {
    registries.push(current.registry);
    current = current.parent;
  }
  return registries;
}

function resolveProvider<T>(
  root: ContextHubState | null,
  key: CapabilityKey,
  preferredProviderId?: string,
): CapabilityProvider<T> | null {
  if (preferredProviderId) {
    let current = root;
    while (current) {
      const candidates = current.registry.getAll<T>(key);
      const match = candidates.find((provider) => {
        if (!provider?.id || provider.id !== preferredProviderId) {
          return false;
        }
        if (provider.isAvailable && !provider.isAvailable()) {
          return false;
        }
        return true;
      });
      if (match) {
        return match;
      }
      current = current.parent;
    }
  }

  let current = root;
  while (current) {
    const provider = current.registry.getBest<T>(key);
    if (provider) {
      return provider;
    }
    current = current.parent;
  }
  return null;
}

export function useCapability<T>(key: CapabilityKey): CapabilitySnapshot<T> {
  const hub = useContextHubState();
  const hostId = useContextHubHostId();
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.overrides[key]?.preferredProviderId,
  );
  const registries = useMemo(() => getRegistryChain(hub), [hub]);
  const lastSnapshotRef = useRef<CapabilitySnapshot<T>>({
    provider: null,
    value: null,
  });

  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      const unsubscribe = registries.map((registry) =>
        registry.subscribe(onStoreChange),
      );
      return () => unsubscribe.forEach((fn) => fn());
    },
    () => {
      const provider = resolveProvider<T>(hub, key, preferredProviderId);
      const value = provider ? provider.getValue() : null;
      const last = lastSnapshotRef.current;
      if (last.provider === provider && shallowEqual(last.value, value)) {
        return last;
      }
      const next = { provider, value };
      lastSnapshotRef.current = next;
      return next;
    },
  );

  // Record consumption for debugging/visualization (throttled internally)
  useEffect(() => {
    if (hostId && hub && snapshot.provider) {
      hub.registry.recordConsumption(key, hostId, snapshot.provider);
    }
  }, [hub, hostId, key, snapshot.provider]);

  return snapshot;
}

export function useProvideCapability<T>(
  key: CapabilityKey,
  provider: CapabilityProvider<T>,
  deps: DependencyList = [],
  options?: { scope?: CapabilityScope },
) {
  const hub = useContextHubState();
  const providerRef = useRef(provider);

  const stableProvider = useMemo<CapabilityProvider<T>>(
    () => ({
      id: provider.id,
      label: provider.label,
      description: provider.description,
      priority: provider.priority,
      exposeToContextMenu: provider.exposeToContextMenu,
      isAvailable: () => providerRef.current.isAvailable?.(),
      getValue: () => providerRef.current.getValue(),
    }),
    [],
  );

  useEffect(() => {
    if (!hub) {
      return;
    }
    const scope = options?.scope ?? "local";
    let target = hub;
    if (scope === "parent") {
      target = hub.parent ?? hub;
    } else if (scope === "root") {
      while (target.parent) {
        target = target.parent;
      }
    }
    return target.registry.register(key, stableProvider);
  }, [hub, key, options?.scope]);

  useEffect(() => {
    providerRef.current = provider;
    stableProvider.id = provider.id;
    stableProvider.label = provider.label;
    stableProvider.description = provider.description;
    stableProvider.priority = provider.priority;
    stableProvider.exposeToContextMenu = provider.exposeToContextMenu;
  }, [provider, stableProvider, ...deps]);
}
