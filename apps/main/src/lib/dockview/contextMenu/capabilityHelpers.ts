/**
 * Capability Access Helpers
 *
 * Typed helpers for accessing capabilities from MenuActionContext.
 * These encourage consistent patterns across all action files.
 *
 * See types.ts for documentation on SNAPSHOT vs LIVE STATE patterns.
 */

import type { CapabilityKey, CapabilityProvider } from '@pixsim7/shared.capabilities-core';

import type { ContextHubState } from '@features/contextHub';

import type { MenuActionContext } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Access (ctx.capabilities)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a capability value from the snapshot.
 * Use this for simple value access in most actions.
 *
 * @param ctx - Menu action context
 * @param key - Capability key to retrieve
 * @returns The resolved capability value, or undefined if not available
 *
 * @example
 * const genContext = getCapability<GenerationContextSummary>(ctx, 'generationContext');
 * if (genContext?.mode === 'quick') { ... }
 */
export function getCapability<T>(ctx: MenuActionContext, key: CapabilityKey): T | undefined {
  return ctx.capabilities?.[key] as T | undefined;
}

/**
 * Check if a capability has a truthy value in the snapshot.
 *
 * @param ctx - Menu action context
 * @param key - Capability key to check
 * @returns true if the capability exists and has a truthy value
 */
export function hasCapability(ctx: MenuActionContext, key: CapabilityKey): boolean {
  return !!ctx.capabilities?.[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// Live State Access (ctx.contextHubState)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scope entry when walking the registry chain.
 */
export interface RegistryScope {
  label: string;
  registry: ContextHubState['registry'];
  state: ContextHubState;
}

/**
 * Walk the registry chain from local to root scope.
 * Use for introspection or when you need to see all providers.
 *
 * @param ctx - Menu action context
 * @returns Array of scopes from local to root
 */
export function getRegistryChain(ctx: MenuActionContext): RegistryScope[] {
  const chain: RegistryScope[] = [];
  let current = ctx.contextHubState;
  let index = 0;

  while (current) {
    const label = current.hostId ?? (index === 0 ? 'local' : `scope-${index}`);
    chain.push({ label, registry: current.registry, state: current });
    current = current.parent;
    index++;
  }

  return chain;
}

/**
 * Provider entry with availability info.
 */
export interface ProviderEntry<T = unknown> {
  scope: string;
  provider: CapabilityProvider<T>;
  available: boolean;
}

/**
 * Get all providers for a capability key across all scopes.
 * Includes availability status for each provider.
 *
 * @param ctx - Menu action context
 * @param key - Capability key to query
 * @returns Array of provider entries with scope and availability info
 */
export function getAllProviders<T>(ctx: MenuActionContext, key: CapabilityKey): ProviderEntry<T>[] {
  const chain = getRegistryChain(ctx);
  return chain.flatMap((scope) =>
    scope.registry.getAll<T>(key).map((provider) => ({
      scope: scope.label,
      provider,
      available: provider.isAvailable ? provider.isAvailable() : true,
    }))
  );
}

/**
 * Resolve the best provider for a capability key, optionally preferring a specific provider ID.
 *
 * @param ctx - Menu action context
 * @param key - Capability key to resolve
 * @param preferredProviderId - Optional preferred provider ID
 * @returns The resolved provider, or null if none available
 */
export function resolveProvider<T>(
  ctx: MenuActionContext,
  key: CapabilityKey,
  preferredProviderId?: string
): CapabilityProvider<T> | null {
  let current = ctx.contextHubState;
  if (!current) return null;

  // Try to find preferred provider first
  if (preferredProviderId) {
    let scope = current;
    while (scope) {
      const candidates = scope.registry.getAll<T>(key);
      const match = candidates.find((provider) => {
        if (provider.id !== preferredProviderId) return false;
        if (provider.isAvailable && !provider.isAvailable()) return false;
        return true;
      });
      if (match) return match;
      scope = scope.parent;
    }
  }

  // Fall back to best available
  while (current) {
    const provider = current.registry.getBest<T>(key);
    if (provider) return provider;
    current = current.parent;
  }

  return null;
}

/**
 * Check if live state is available for advanced queries.
 *
 * @param ctx - Menu action context
 * @returns true if contextHubState is available
 */
export function hasLiveState(ctx: MenuActionContext): boolean {
  return !!ctx.contextHubState;
}
