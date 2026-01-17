/**
 * UI capability registry adapter.
 *
 * This module wraps the core capability registry from @pixsim7/shared.capabilities.core
 * with UI-specific naming conventions for backwards compatibility.
 *
 * The core registry uses "scope" terminology while the UI uses "host" terminology.
 * This adapter bridges the two to maintain API compatibility with existing UI code.
 */

import {
  createCapabilityRegistry as createCoreRegistry,
  type CapabilityRegistry as CoreCapabilityRegistry,
  type CapabilityConsumption as CoreCapabilityConsumption,
} from "@pixsim7/shared.capabilities.core";

import type {
  CapabilityRegistry,
  CapabilityConsumption,
} from "../types";

/** Default throttle interval for new registries (ms) */
const DEFAULT_CONSUMPTION_THROTTLE_MS = 500;

/**
 * Adapt a core consumption record to UI consumption record.
 * Maps consumerScopeId -> consumerHostId for backwards compatibility.
 */
function adaptConsumption(core: CoreCapabilityConsumption): CapabilityConsumption {
  return {
    key: core.key,
    consumerHostId: core.consumerScopeId,
    providerId: core.providerId,
    providerLabel: core.providerLabel,
    lastSeenAt: core.lastSeenAt,
  };
}

/**
 * Create a UI capability registry that wraps the core registry.
 *
 * This maintains backwards compatibility with existing UI code by:
 * - Using "host" terminology instead of "scope"
 * - Adapting consumption records to UI format
 */
export function createCapabilityRegistry(): CapabilityRegistry {
  const core: CoreCapabilityRegistry = createCoreRegistry({
    consumptionThrottleMs: DEFAULT_CONSUMPTION_THROTTLE_MS,
  });

  // Return UI-adapted interface
  return {
    // Pass through core methods unchanged
    register: core.register,
    getBest: core.getBest,
    getAll: core.getAll,
    getKeys: core.getKeys,
    getExposedKeys: core.getExposedKeys,
    subscribe: core.subscribe,
    setConsumptionThrottleMs: core.setConsumptionThrottleMs,
    getConsumptionThrottleMs: core.getConsumptionThrottleMs,

    // Adapt consumption methods to use UI naming (hostId instead of scopeId)
    recordConsumption: (key, consumerHostId, provider) => {
      core.recordConsumption(key, consumerHostId, provider);
    },

    getConsumers: (key) => {
      return core.getConsumers(key).map(adaptConsumption);
    },

    getConsumptionForHost: (hostId) => {
      return core.getConsumptionForScope(hostId).map(adaptConsumption);
    },

    getAllConsumption: () => {
      return core.getAllConsumption().map(adaptConsumption);
    },

    clearConsumptionForHost: (hostId) => {
      core.clearConsumptionForScope(hostId);
    },
  };
}
