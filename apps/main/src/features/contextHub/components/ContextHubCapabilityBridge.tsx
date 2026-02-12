import type { CapabilityProvider } from "@pixsim7/shared.capabilities.core";
import {
  getAppActionCapabilityKey,
  getAppStateCapabilityKey,
} from "@pixsim7/shared.capabilities.core/bridge";
import {
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
} from "@pixsim7/shared.capabilities.core/descriptor";
import { useEffect, useMemo, useRef } from "react";

import {
  type ActionCapability,
  type StateCapability,
  useAllActions,
  useStates,
} from "@lib/capabilities";

import { useContextHubState, getRootHub } from "../hooks/contextHubContext";

type ProviderDisposer = () => void;

export function ContextHubCapabilityBridge() {
  const hub = useContextHubState();
  const actions = useAllActions();
  const states = useStates();

  const actionRef = useRef<Map<string, ActionCapability>>(new Map());
  const stateRef = useRef<Map<string, StateCapability>>(new Map());
  const providerRef = useRef<Map<string, CapabilityProvider>>(new Map());
  const disposerRef = useRef<Map<string, ProviderDisposer>>(new Map());

  const root = useMemo(() => getRootHub(hub), [hub]);

  useEffect(() => {
    if (!root) return;

    actionRef.current = new Map(actions.map((action) => [action.id, action]));
    stateRef.current = new Map(states.map((state) => [state.id, state]));

    const nextKeys = new Set<string>();

    actions.forEach((action) => {
      const key = getAppActionCapabilityKey(action.id);
      nextKeys.add(key);

      let provider = providerRef.current.get(key);
      if (!provider) {
        provider = {
          id: action.id,
          label: action.name,
          description: action.description,
          priority: 0,
          exposeToContextMenu: false,
          getValue: () => actionRef.current.get(action.id) ?? null,
        };
        providerRef.current.set(key, provider);
        const dispose = root.registry.register(key, provider);
        disposerRef.current.set(key, dispose);
      } else {
        provider.label = action.name;
        provider.description = action.description;
      }

      registerCapabilityDescriptor({
        key,
        label: action.name,
        description: action.description,
        kind: "action",
        source: "app",
      });
    });

    states.forEach((state) => {
      const key = getAppStateCapabilityKey(state.id);
      nextKeys.add(key);

      let provider = providerRef.current.get(key);
      if (!provider) {
        provider = {
          id: state.id,
          label: state.name,
          description: state.readonly ? "Read-only state" : undefined,
          priority: 0,
          exposeToContextMenu: false,
          getValue: () => stateRef.current.get(state.id) ?? null,
        };
        providerRef.current.set(key, provider);
        const dispose = root.registry.register(key, provider);
        disposerRef.current.set(key, dispose);
      } else {
        provider.label = state.name;
      }

      registerCapabilityDescriptor({
        key,
        label: state.name,
        description: state.readonly ? "Read-only state" : undefined,
        kind: "state",
        source: "app",
      });
    });

    disposerRef.current.forEach((dispose, key) => {
      if (!nextKeys.has(key)) {
        dispose();
        disposerRef.current.delete(key);
        providerRef.current.delete(key);
        unregisterCapabilityDescriptor(key);
      }
    });

    const disposers = disposerRef.current;
    const providers = providerRef.current;

    return () => {
      // Keep descriptor registry aligned with provider lifecycle (StrictMode/HMR safe).
      providers.forEach((_, key) => {
        unregisterCapabilityDescriptor(key);
      });
      disposers.forEach((dispose) => dispose());
      disposers.clear();
      providers.clear();
    };
  }, [actions, states, root]);

  return null;
}
