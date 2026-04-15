import type {
  CapabilityKey,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityScope,
} from "@pixsim7/shared.capabilities.core";
import type { DependencyList } from "react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";


import { CAP_PANEL_CONTEXT } from "../domain/capabilityKeys";
import { useContextHubOverridesStore } from "../stores/contextHubOverridesStore";

import {
  useContextHubHostId,
  useContextHubState,
  getRegistryChain,
  getRootHub,
  type ContextHubState,
} from "./contextHubContext";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function structuralEqual(
  a: unknown,
  b: unknown,
  seenPairs: WeakMap<object, Set<object>> = new WeakMap(),
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const seenForA = seenPairs.get(a);
  if (seenForA?.has(b)) {
    return true;
  }
  if (seenForA) {
    seenForA.add(b);
  } else {
    seenPairs.set(a, new Set([b]));
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!structuralEqual(a[i], b[i], seenPairs)) return false;
    }
    return true;
  }

  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!structuralEqual(a[key], b[key], seenPairs)) return false;
  }
  return true;
}

function resolveProvider<T>(
  root: ContextHubState | null,
  key: CapabilityKey,
  preferredProviderId?: string,
): CapabilityProvider<T> | null {
  if (preferredProviderId) {
    let bestMatch: {
      provider: CapabilityProvider<T>;
      priority: number;
      depth: number;
      index: number;
    } | null = null;
    let depth = 0;
    let current = root;
    while (current) {
      const candidates = current.registry.getAll<T>(key);
      candidates.forEach((provider, index) => {
        if (!provider?.id || provider.id !== preferredProviderId) {
          return;
        }
        if (provider.isAvailable && !provider.isAvailable()) {
          return;
        }
        const priority = provider.priority ?? 0;
        if (!bestMatch) {
          bestMatch = { provider, priority, depth, index };
          return;
        }
        if (priority > bestMatch.priority) {
          bestMatch = { provider, priority, depth, index };
          return;
        }
        if (priority < bestMatch.priority) {
          return;
        }
        // For equal priority:
        // 1) prefer nearest scope in the hub chain
        // 2) within that scope, prefer most recently registered provider
        if (depth < bestMatch.depth) {
          bestMatch = { provider, priority, depth, index };
          return;
        }
        if (depth === bestMatch.depth && index > bestMatch.index) {
          bestMatch = { provider, priority, depth, index };
        }
      });
      current = current.parent;
      depth += 1;
    }
    if (bestMatch) {
      return bestMatch.provider;
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

function resolveTargetHub(
  hub: ContextHubState,
  scope: CapabilityScope | undefined,
): ContextHubState {
  if (scope === "parent") {
    return hub.parent ?? hub;
  }
  if (scope === "root") {
    return getRootHub(hub) ?? hub;
  }
  return hub;
}

function dependencyListEqual(a: DependencyList | null, b: DependencyList): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

type ProviderMetadata = Pick<
  CapabilityProvider,
  "id" | "label" | "description" | "priority" | "exposeToContextMenu"
>;

function readProviderMetadata(provider: CapabilityProvider): ProviderMetadata {
  return {
    id: provider.id,
    label: provider.label,
    description: provider.description,
    priority: provider.priority,
    exposeToContextMenu: provider.exposeToContextMenu,
  };
}

function providerMetadataEqual(a: ProviderMetadata | null, b: ProviderMetadata): boolean {
  if (!a) return false;
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.description === b.description &&
    a.priority === b.priority &&
    a.exposeToContextMenu === b.exposeToContextMenu
  );
}

export function useCapability<T>(key: CapabilityKey): CapabilitySnapshot<T> {
  const hub = useContextHubState();
  const hostId = useContextHubHostId();
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.getPreferredProviderId(key, hostId),
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
      if (last.provider === provider && structuralEqual(last.value, value)) {
        return last;
      }
      const next = { provider, value };
      lastSnapshotRef.current = next;
      return next;
    },
  );

  // Record consumption for debugging/visualization (throttled internally)
  // Always record at root level so it's accessible from Properties popup
  useEffect(() => {
    if (hostId && hub) {
      const root = getRootHub(hub);
      root?.registry.recordConsumption(key, hostId, snapshot.provider ?? null);
    }
  }, [hub, hostId, key, snapshot.provider]);

  return snapshot;
}

/**
 * Return all providers for a capability key across the entire hub chain.
 * Useful when multiple providers may exist (e.g., multiple prompt boxes)
 * and the consumer wants to let the user pick one.
 */
export function useCapabilityAll<T>(
  key: CapabilityKey,
  options?: { includeUnavailable?: boolean },
): Array<{ provider: CapabilityProvider<T>; value: T }> {
  const hub = useContextHubState();
  const includeUnavailable = options?.includeUnavailable ?? false;
  const registries = useMemo(() => getRegistryChain(hub), [hub]);
  const lastRef = useRef<Array<{ provider: CapabilityProvider<T>; value: T }>>([]);

  const result = useSyncExternalStore(
    (onStoreChange) => {
      const unsubs = registries.map((r) => r.subscribe(onStoreChange));
      return () => unsubs.forEach((fn) => fn());
    },
    () => {
      const all: Array<{ provider: CapabilityProvider<T>; value: T }> = [];
      const seenProviders = new Set<CapabilityProvider<T>>();
      let current = hub;
      while (current) {
        const providers = current.registry.getAll<T>(key);
        for (const p of providers) {
          if (!includeUnavailable && p.isAvailable && !p.isAvailable()) continue;
          // A provider may be registered in both local + root scope to support
          // nearest-scope resolution and global discovery. Keep one entry.
          if (seenProviders.has(p)) continue;
          seenProviders.add(p);
          all.push({ provider: p, value: p.getValue() });
        }
        current = current.parent;
      }
      // Stable reference if content is the same
      const last = lastRef.current;
      if (
        last.length === all.length &&
        last.every((l, i) => l.provider === all[i].provider && structuralEqual(l.value, all[i].value))
      ) {
        return last;
      }
      lastRef.current = all;
      return all;
    },
  );

  return result;
}

export function useProvideCapability<T>(
  key: CapabilityKey,
  provider: CapabilityProvider<T>,
  deps: DependencyList = [],
  options?: { scope?: CapabilityScope; enabled?: boolean },
) {
  const hub = useContextHubState();
  const providerRef = useRef(provider);
  const lastProviderObjectRef = useRef<CapabilityProvider<T>>(provider);
  const lastDepsRef = useRef<DependencyList | null>([...deps]);
  const lastMetaRef = useRef<ProviderMetadata | null>(readProviderMetadata(provider));

  const stableProviderRef = useRef<CapabilityProvider<T>>({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    priority: provider.priority,
    exposeToContextMenu: provider.exposeToContextMenu,
    isAvailable: () => providerRef.current.isAvailable?.() ?? true,
    getValue: () => providerRef.current.getValue(),
  });
  const stableProvider = stableProviderRef.current;
  const enabled = options?.enabled ?? true;
  const targetHub = useMemo(
    () => (hub ? resolveTargetHub(hub, options?.scope) : null),
    [hub, options?.scope],
  );

  useEffect(() => {
    if (!targetHub) {
      return;
    }
    if (!enabled) {
      return;
    }
    return targetHub.registry.register(key, stableProvider);
  }, [enabled, key, stableProvider, targetHub]);

  useEffect(() => {
    providerRef.current = provider;
    const nextMeta = readProviderMetadata(provider);
    const providerChanged = lastProviderObjectRef.current !== provider;
    const depsChanged = !dependencyListEqual(lastDepsRef.current, deps);
    const metadataChanged = !providerMetadataEqual(lastMetaRef.current, nextMeta);

    stableProvider.id = nextMeta.id;
    stableProvider.label = nextMeta.label;
    stableProvider.description = nextMeta.description;
    stableProvider.priority = nextMeta.priority;
    stableProvider.exposeToContextMenu = nextMeta.exposeToContextMenu;

    if (targetHub && enabled && (providerChanged || depsChanged || metadataChanged)) {
      targetHub.registry.invalidate(key);
    }

    lastProviderObjectRef.current = provider;
    lastDepsRef.current = [...deps];
    lastMetaRef.current = nextMeta;
  }, [provider, deps, stableProvider, targetHub, enabled, key]);
}

/**
 * Convenience hook to consume panel context provided by SmartDockview.
 *
 * SmartDockview automatically provides any `context` prop as a capability,
 * allowing panels to access it via this hook instead of prop drilling.
 *
 * @template T - The expected shape of the context object
 * @returns The panel context value, or null if not provided
 *
 * @example
 * // In a panel component
 * const context = usePanelContext<QuickGenPanelContext>();
 * if (context) {
 *   const { prompt, controller } = context;
 * }
 */
export function usePanelContext<T = unknown>(): T | null {
  const { value } = useCapability<T>(CAP_PANEL_CONTEXT);
  return value;
}
