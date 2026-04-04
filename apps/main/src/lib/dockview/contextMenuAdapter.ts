/**
 * Context Menu Adapter
 *
 * Wires app-specific capabilities into the shared context menu system.
 */

import type { CapabilityKey, CapabilityProvider } from '@pixsim7/shared.capabilities.core';
import { contextMenuRegistry, type CapabilitiesSnapshotProvider } from '@pixsim7/shared.ui.context-menu';
import { useCallback, useMemo, useRef } from 'react';

import { capabilityRegistry } from '@lib/capabilities';

import { useContextHubOverridesStore, useContextHubState, type ContextHubState } from '@features/contextHub';


// Wire capability source at import time
contextMenuRegistry.setCapabilitySource(capabilityRegistry);

/**
 * Hook that builds a CapabilitiesSnapshotProvider from ContextHub state.
 * Contains the buildCapabilitiesSnapshot + resolveProvider logic
 * that was removed from the shared ContextMenuProvider.
 */
export function useCapabilitiesSnapshotProvider(): CapabilitiesSnapshotProvider {
  const hub = useContextHubState();
  const overrides = useContextHubOverridesStore((store) => store.overrides);
  const cacheRef = useRef<{ keys: CapabilityKey[]; map: Record<string, unknown> } | null>(null);

  // Subscribe to the entire hub chain so changes in parent registries
  // (e.g. a generation widget provided at root) also trigger snapshot rebuilds.
  const subscribe = useCallback((listener: () => void) => {
    if (!hub) {
      return () => {};
    }
    const unsubs: Array<() => void> = [];
    let current: ContextHubState | null = hub;
    while (current) {
      unsubs.push(current.registry.subscribe(listener));
      current = current.parent;
    }
    return () => unsubs.forEach((fn) => fn());
  }, [hub]);

  const getSnapshot = useCallback(() => {
    return buildCapabilitiesSnapshot(hub, overrides, cacheRef);
  }, [hub, overrides]);

  return useMemo(() => ({ subscribe, getSnapshot }), [subscribe, getSnapshot]);
}

function buildCapabilitiesSnapshot(
  hub: ContextHubState | null,
  overrides: Record<string, { preferredProviderId?: string } | undefined>,
  cacheRef: React.MutableRefObject<{
    keys: CapabilityKey[];
    map: Record<string, unknown>;
  } | null>,
) {
  if (!hub) {
    return { keys: [] as CapabilityKey[], map: {} as Record<string, unknown> };
  }

  // Collect exposed keys from the entire hub chain so parent-scoped providers
  // (e.g. CAP_GENERATION_WIDGET registered at root) are visible to child scopes.
  const keySet = new Set<CapabilityKey>();
  let walk: ContextHubState | null = hub;
  while (walk) {
    for (const k of walk.registry.getExposedKeys()) {
      keySet.add(k);
    }
    walk = walk.parent;
  }
  const keys = Array.from(keySet).sort();
  const map: Record<string, unknown> = {};
  for (const key of keys) {
    const preferredProviderId = overrides[key]?.preferredProviderId;
    const provider = resolveProvider(hub, key, preferredProviderId);
    map[key] = provider ? provider.getValue() : null;
  }

  const last = cacheRef.current;
  if (last && sameKeys(last.keys, keys) && sameValues(last.map, map)) {
    return last;
  }

  const next = { keys, map };
  cacheRef.current = next;
  return next;
}

function resolveProvider<T>(
  root: ContextHubState | null,
  key: CapabilityKey,
  preferredProviderId?: string,
): CapabilityProvider<T> | null {
  if (!root) {
    return null;
  }

  if (preferredProviderId) {
    let current: ContextHubState | null = root;
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

  let current: ContextHubState | null = root;
  while (current) {
    const provider = current.registry.getBest<T>(key);
    if (provider) {
      return provider;
    }
    current = current.parent;
  }
  return null;
}

function sameKeys(a: CapabilityKey[], b: CapabilityKey[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameValues(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!structuralEqual(a[key], b[key])) return false;
  }
  return true;
}

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
