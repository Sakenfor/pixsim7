import type {
  CapabilityKey,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityScope,
} from "@pixsim7/capabilities-core";
import type { DependencyList } from "react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";


import { CAP_PANEL_CONTEXT } from "../domain/capabilityKeys";
import { useContextHubOverridesStore } from "../stores/contextHubOverridesStore";

import {
  useContextHubHostId,
  useContextHubState,
  type ContextHubState,
} from "./contextHubContext";

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

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(aRecord[key], bRecord[key])) return false;
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
      if (last.provider === provider && shallowEqual(last.value, value)) {
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
      let root = hub;
      while (root.parent) {
        root = root.parent;
      }
      root.registry.recordConsumption(key, hostId, snapshot.provider ?? null);
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

  const stableProviderRef = useRef<CapabilityProvider<T>>({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    priority: provider.priority,
    exposeToContextMenu: provider.exposeToContextMenu,
    isAvailable: () => providerRef.current.isAvailable?.(),
    getValue: () => providerRef.current.getValue(),
  });
  const stableProvider = stableProviderRef.current;

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
  }, [hub, key, options?.scope, stableProvider]);

  useEffect(() => {
    providerRef.current = provider;
    stableProvider.id = provider.id;
    stableProvider.label = provider.label;
    stableProvider.description = provider.description;
    stableProvider.priority = provider.priority;
    stableProvider.exposeToContextMenu = provider.exposeToContextMenu;
  }, [provider, deps, stableProvider]);
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
