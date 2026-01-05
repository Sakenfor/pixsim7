/**
 * UI capability registry adapter.
 *
 * This module wraps the core capability registry from @pixsim7/capabilities-core
 * with UI-specific naming conventions for backwards compatibility.
 *
 * The core registry uses "scope" terminology while the UI uses "host" terminology.
 * This adapter bridges the two to maintain API compatibility with existing UI code.
 */

import {
  createCapabilityRegistry as createCoreRegistry,
  type CapabilityRegistry as CoreCapabilityRegistry,
  type CapabilityConsumption as CoreCapabilityConsumption,
} from "@pixsim7/capabilities-core";

import type {
  CapabilityRegistry,
  CapabilityConsumption,
} from "../types";

// ============================================================================
// Consumption Throttle Configuration (deprecated - use registry methods)
// ============================================================================

/** Default throttle interval for new registries (ms) */
let defaultConsumptionThrottleMs = 500;

/**
 * Set the default consumption throttle interval for newly created registries.
 *
 * @deprecated Use registry.setConsumptionThrottleMs() instead for per-registry control.
 * This only affects registries created after the call.
 *
 * @param ms - Throttle interval in milliseconds (0 to disable throttling)
 */
export function setConsumptionThrottle(ms: number): void {
  defaultConsumptionThrottleMs = Math.max(0, ms);
}

/**
 * Get the default consumption throttle interval for new registries.
 *
 * @deprecated Use registry.getConsumptionThrottleMs() instead for per-registry control.
 */
export function getConsumptionThrottle(): number {
  return defaultConsumptionThrottleMs;
}

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
  // Create core registry with current default throttle setting
  const core: CoreCapabilityRegistry = createCoreRegistry({
    consumptionThrottleMs: defaultConsumptionThrottleMs,
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
