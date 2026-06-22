/**
 * Global registry mapping `hostId` → that host's local capability registry.
 *
 * `ContextHubHost` self-registers on mount so unrelated subtrees (e.g. the
 * Properties popup rendered in a portal) can introspect a panel's own
 * capabilities without walking the parent chain.
 */

import type { CapabilityRegistry } from "../types";

const hosts = new Map<string, CapabilityRegistry>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function registerContextHubHost(
  hostId: string,
  registry: CapabilityRegistry,
): () => void {
  hosts.set(hostId, registry);
  notify();
  return () => {
    if (hosts.get(hostId) === registry) {
      hosts.delete(hostId);
      notify();
    }
  };
}

export function getContextHubHostRegistry(
  hostId: string | undefined,
): CapabilityRegistry | null {
  if (!hostId) return null;
  return hosts.get(hostId) ?? null;
}

export function subscribeContextHubHosts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
