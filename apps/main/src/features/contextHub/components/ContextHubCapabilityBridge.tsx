import { useEffect, useMemo, useRef } from "react";
import {
  type ActionCapability,
  type StateCapability,
  useCapabilityStore,
} from "@lib/capabilities";
import { useContextHubState } from "../ContextHubHost";
import type { CapabilityProvider } from "../types";
import {
  registerCapabilityDescriptor,
  unregisterCapabilityDescriptor,
} from "../descriptorRegistry";
import {
  getAppActionCapabilityKey,
  getAppStateCapabilityKey,
} from "../appCapabilityBridge";

type ProviderDisposer = () => void;

function getRootHub(state: ReturnType<typeof useContextHubState>) {
  let current = state;
  while (current?.parent) {
    current = current.parent;
  }
  return current;
}

export function ContextHubCapabilityBridge() {
  const hub = useContextHubState();
  const actions = useCapabilityStore((s) => s.getAllActions());
  const states = useCapabilityStore((s) => s.getAllStates());

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

    return () => {
      disposerRef.current.forEach((dispose) => dispose());
      disposerRef.current.clear();
      providerRef.current.clear();
    };
  }, [actions, states, root]);

  return null;
}
