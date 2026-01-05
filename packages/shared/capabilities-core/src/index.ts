/**
 * @pixsim7/capabilities-core
 *
 * Core capability registry - pure TypeScript, no React/DOM dependencies.
 *
 * This package provides the fundamental capability system that can be used
 * by both UI (React) and non-UI code. The UI adapter (in apps/main) wraps
 * this core with React hooks while keeping the same underlying registry.
 *
 * @example
 * ```ts
 * import { createCapabilityRegistry } from "@pixsim7/capabilities-core";
 *
 * // Create a registry instance
 * const registry = createCapabilityRegistry();
 *
 * // Register a provider
 * const unsubscribe = registry.register("myCapability", {
 *   id: "myProvider",
 *   priority: 10,
 *   getValue: () => ({ data: "value" }),
 * });
 *
 * // Get the best available provider
 * const provider = registry.getBest("myCapability");
 * if (provider) {
 *   const value = provider.getValue();
 *   console.log(value); // { data: "value" }
 * }
 *
 * // Subscribe to changes
 * const unsub = registry.subscribe(() => {
 *   console.log("Registry changed!");
 * });
 *
 * // Cleanup
 * unsubscribe();
 * unsub();
 * ```
 */

// Types
export type {
  CapabilityKey,
  CapabilityScope,
  CapabilityProvider,
  CapabilitySnapshot,
  CapabilityConsumption,
  CapabilityRegistry,
  CapabilityRegistryOptions,
} from "./types";

// Registry factory
export { createCapabilityRegistry } from "./registry";
