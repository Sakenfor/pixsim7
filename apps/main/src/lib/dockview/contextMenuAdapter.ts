/**
 * Context Menu Adapter
 *
 * Wires app-specific capabilities into the shared context menu system.
 */

import type { CapabilityKey, CapabilityProvider } from '@pixsim7/shared.capabilities.core';
import { contextMenuRegistry, type CapabilitiesSnapshotProvider } from '@pixsim7/shared.ui.context-menu';
import { useRef } from 'react';

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
  const subscribe = (listener: () => void) => {
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
  };

  const getSnapshot = () => {
    return buildCapabilitiesSnapshot(hub, overrides, cacheRef);
  };

  return { subscribe, getSnapshot };
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
    return { keys: [] as string[], map: {} as Record<string, unknown> };
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
  const keys = Array.from(keySet);
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
    if (a[key] !== b[key]) return false;
  }
  return true;
}
