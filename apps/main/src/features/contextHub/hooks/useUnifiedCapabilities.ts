import type { CapabilityKey } from "@pixsim7/shared.capabilities.core";
import { useMemo, useSyncExternalStore } from "react";

import type {
  ActionCapability,
  FeatureCapability,
  RouteCapability,
  StateCapability,
} from "@lib/capabilities";
import { useActions, useFeatures, useRoutes, useStates } from "@lib/capabilities";

import { getAppActionCapabilityKey, getAppStateCapabilityKey } from "../domain/appCapabilityBridge";
import {
  getCapabilityDescriptors,
  type CapabilityDescriptor,
} from "../domain/descriptorRegistry";

import { useContextHubState, getRegistryChain } from "./contextHubContext";

export type UnifiedCapabilityKind =
  | "context"
  | "data"
  | "action"
  | "state"
  | "route"
  | "feature";

export type UnifiedCapabilitySource = "contextHub" | "app" | "both";

export interface UnifiedCapabilityEntry {
  id: string;
  capabilityKey?: CapabilityKey;
  kind: UnifiedCapabilityKind;
  label: string;
  description?: string;
  source: UnifiedCapabilitySource;
  action?: ActionCapability;
  state?: StateCapability;
  route?: RouteCapability;
  feature?: FeatureCapability;
}

export interface UnifiedCapabilityOptions {
  includeContextHub?: boolean;
  includeApp?: boolean;
  includeActions?: boolean;
  includeStates?: boolean;
  includeRoutes?: boolean;
  includeFeatures?: boolean;
}

function useContextHubKeys(): CapabilityKey[] {
  const hub = useContextHubState();
  const registries = useMemo(() => getRegistryChain(hub), [hub]);

  return useSyncExternalStore(
    (onStoreChange) => {
      if (registries.length === 0) return () => {};
      const unsubscribes = registries.map((registry) =>
        registry.subscribe(onStoreChange),
      );
      return () => unsubscribes.forEach((fn) => fn());
    },
    () => {
      if (registries.length === 0) return [];
      const keys = new Set<CapabilityKey>();
      registries.forEach((registry) => {
        registry.getKeys().forEach((key) => keys.add(key));
      });
      return Array.from(keys).sort();
    },
  );
}

function resolveDescriptorKind(descriptor?: CapabilityDescriptor): UnifiedCapabilityKind {
  if (!descriptor?.kind) return "context";
  if (descriptor.kind === "data") return "data";
  if (descriptor.kind === "action") return "action";
  if (descriptor.kind === "state") return "state";
  return "context";
}

export function useUnifiedCapabilities(
  options: UnifiedCapabilityOptions = {},
): UnifiedCapabilityEntry[] {
  const {
    includeContextHub = true,
    includeApp = true,
    includeActions = includeApp,
    includeStates = includeApp,
    includeRoutes = includeApp,
    includeFeatures = includeApp,
  } = options;

  const hubKeys = useContextHubKeys();
  const actions = useActions();
  const states = useStates();
  const routes = useRoutes();
  const features = useFeatures();

  return useMemo(() => {
    const descriptors = getCapabilityDescriptors();
    const descriptorByKey = new Map<CapabilityKey, CapabilityDescriptor>(
      descriptors.map((descriptor) => [descriptor.key, descriptor]),
    );
    const entriesByKey = new Map<CapabilityKey, UnifiedCapabilityEntry>();

    if (includeContextHub) {
      hubKeys.forEach((key) => {
        const descriptor = descriptorByKey.get(key);
        const label = descriptor?.label ?? key;
        const description = descriptor?.description;
        const kind = resolveDescriptorKind(descriptor);
        const source: UnifiedCapabilitySource = "contextHub";
        entriesByKey.set(key, {
          id: key,
          capabilityKey: key,
          kind,
          label,
          description,
          source,
        });
      });
    }

    if (includeActions) {
      actions.forEach((action) => {
        const key = getAppActionCapabilityKey(action.id);
        const existing = entriesByKey.get(key);
        if (existing) {
          existing.action = action;
          existing.kind = "action";
          existing.label = action.name;
          existing.description = action.description ?? existing.description;
          existing.source = existing.source === "contextHub" ? "both" : existing.source;
        } else {
          entriesByKey.set(key, {
            id: key,
            capabilityKey: key,
            kind: "action",
            label: action.name,
            description: action.description,
            source: "app",
            action,
          });
        }
      });
    }

    if (includeStates) {
      states.forEach((state) => {
        const key = getAppStateCapabilityKey(state.id);
        const existing = entriesByKey.get(key);
        if (existing) {
          existing.state = state;
          existing.kind = "state";
          existing.label = state.name;
          existing.description = state.readonly ? "Read-only state" : existing.description;
          existing.source = existing.source === "contextHub" ? "both" : existing.source;
        } else {
          entriesByKey.set(key, {
            id: key,
            capabilityKey: key,
            kind: "state",
            label: state.name,
            description: state.readonly ? "Read-only state" : undefined,
            source: "app",
            state,
          });
        }
      });
    }

    const unkeyed: UnifiedCapabilityEntry[] = [];

    if (includeRoutes) {
      routes.forEach((route) => {
        unkeyed.push({
          id: route.path,
          kind: "route",
          label: route.name,
          description: route.description,
          source: "app",
          route,
        });
      });
    }

    if (includeFeatures) {
      features.forEach((feature) => {
        unkeyed.push({
          id: feature.id,
          kind: "feature",
          label: feature.name,
          description: feature.description,
          source: "app",
          feature,
        });
      });
    }

    const keyed = Array.from(entriesByKey.values());
    return [...keyed, ...unkeyed].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [
    includeContextHub,
    includeActions,
    includeStates,
    includeRoutes,
    includeFeatures,
    hubKeys,
    actions,
    states,
    routes,
    features,
  ]);
}

export function useUnifiedCapability(
  idOrKey: string,
  options?: UnifiedCapabilityOptions,
): UnifiedCapabilityEntry | undefined {
  const entries = useUnifiedCapabilities(options);
  return useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.id === idOrKey || entry.capabilityKey === idOrKey,
      ),
    [entries, idOrKey],
  );
}
