/**
 * App capability registry.
 *
 * Features, routes, actions, and state exposed to UI surfaces and tooling.
 */

export type {
  AppActionCapability,
  AppActionContext,
  AppActionEvent,
  AppActionMenuContext,
  AppActionSource,
  AppActionVisibility,
  AppCapabilityCategory,
  AppCapabilityRegistry,
  AppCapabilityRegistryOptions,
  AppFeatureCapability,
  AppRouteCapability,
  AppStateCapability,
} from "./types";

export { createAppCapabilityRegistry } from "./registry";

export { toAppActionCapability } from "./adapters";
