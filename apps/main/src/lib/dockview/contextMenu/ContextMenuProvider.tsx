/**
 * Context Menu Provider
 *
 * Global React context provider for context menu state and actions.
 * Supports multiple dockviews with cross-dockview communication.
 *
 * Services are injected via props to keep the system decoupled and testable.
 */

import type { CapabilityKey, CapabilityProvider } from '@pixsim7/shared.capabilities-core';
import type { DockviewApi } from 'dockview-core';
import {
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  useRef,
  useSyncExternalStore,
} from 'react';

import { useContextHubOverridesStore, useContextHubState, type ContextHubState } from '@features/contextHub';

import { createDockviewHost } from '../host';
import {
  getDockviewHost as getHostFromRegistry,
  getDockviewApi as getApiFromRegistry,
  getDockviewHostIds as getHostIdsFromRegistry,
  getDockviewCapabilities,
  registerDockviewHost as registerInRegistry,
  unregisterDockviewHost as unregisterFromRegistry,
  type DockviewCapabilities,
} from '../hostRegistry';

import { ContextMenuContext, type ContextMenuContextValue } from './ContextMenuContext';
import { contextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContext, PanelRegistryLike } from './types';




/** Dockview serialized layout type */
export type DockviewLayout = ReturnType<DockviewApi['toJSON']>;

interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContext | null;
}

/** Services that can be injected into the context menu system */
export interface ContextMenuServices {
  /** Workspace store for preset management */
  workspaceStore?: unknown;
  /** Panel registry for querying available panels */
  panelRegistry?: PanelRegistryLike;
}

interface ContextMenuProviderProps {
  children: ReactNode;
  /** Custom registry (default: global contextMenuRegistry) */
  registry?: ContextMenuRegistry;
  /** Injected services for actions to use */
  services?: ContextMenuServices;
}

/**
 * Global Context Menu Provider
 *
 * Manages context menu state and provides access to menu actions.
 * Tracks multiple dockview instances for cross-dockview communication.
 *
 * Should be placed at the app root level.
 */
export function ContextMenuProvider({
  children,
  registry = contextMenuRegistry,
  services = {},
}: ContextMenuProviderProps) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    context: null,
  });
  const hub = useContextHubState();
  const overrides = useContextHubOverridesStore((store) => store.overrides);
  const lastCapabilitiesRef = useRef<{ keys: CapabilityKey[]; map: Record<string, unknown> } | null>(null);

  const capabilitiesSnapshot = useSyncExternalStore(
    (listener) => {
      if (!hub) {
        return () => {};
      }
      return hub.registry.subscribe(listener);
    },
    () => buildCapabilitiesSnapshot(hub, overrides, lastCapabilitiesRef),
  );

  // Store services in ref to avoid recreating callbacks
  const servicesRef = useRef(services);
  servicesRef.current = services;

  // Store capabilitiesSnapshot in ref to avoid showContextMenu changing on every capability update
  const capabilitiesSnapshotRef = useRef(capabilitiesSnapshot);
  capabilitiesSnapshotRef.current = capabilitiesSnapshot;

  // Registration and lookup now delegates to the central hostRegistry.
  // This eliminates duplicate state and ensures all systems see the same dockviews.

  const registerDockview = useCallback(
    (id: string, api: DockviewApi, capabilities?: DockviewCapabilities) => {
      // Create host and register with central registry
      const host = createDockviewHost(id, api);
      registerInRegistry(host, capabilities);
    },
    []
  );

  const unregisterDockview = useCallback((id: string) => {
    unregisterFromRegistry(id);
  }, []);

  // Delegate lookups to hostRegistry
  const getDockviewApi = useCallback((id: string): DockviewApi | undefined => {
    return getApiFromRegistry(id);
  }, []);

  const getDockviewIds = useCallback((): string[] => {
    return getHostIdsFromRegistry();
  }, []);

  const getDockviewHost = useCallback((id: string): DockviewHost | undefined => {
    return getHostFromRegistry(id);
  }, []);

  const getDockviewHostIds = useCallback((): string[] => {
    return getHostIdsFromRegistry();
  }, []);

  const showContextMenu = useCallback((partial: Partial<MenuActionContext>) => {
    // Get current dockview API if ID provided
    const currentDockviewId = partial.currentDockviewId;
    const currentApi = currentDockviewId ? getApiFromRegistry(currentDockviewId) : undefined;

    // Get capabilities for current dockview from central registry
    const dockviewCaps = currentDockviewId ? getDockviewCapabilities(currentDockviewId) : undefined;

    // Build full context with injected services and dockview capabilities
    const fullContext: MenuActionContext = {
      contextType: partial.contextType!,
      position: partial.position!,
      data: partial.data,
      capabilities: capabilitiesSnapshotRef.current.map,
      currentDockviewId,
      getDockviewApi,
      getDockviewIds,
      getDockviewHost,
      getDockviewHostIds,
      // Inject global services from props
      workspaceStore: servicesRef.current.workspaceStore,
      panelRegistry: servicesRef.current.panelRegistry,
      // Inject dockview-specific capabilities from central registry
      floatPanelHandler: dockviewCaps?.floatPanelHandler,
      ...partial,
    };

    if (!fullContext.api && currentApi) {
      fullContext.api = currentApi;
    }

    setState({ isOpen: true, context: fullContext });
  }, [getDockviewApi, getDockviewIds]);

  const hideContextMenu = useCallback(() => {
    setState({ isOpen: false, context: null });
  }, []);

  // Memoize context value to prevent unnecessary consumer re-renders
  const value = useMemo<ContextMenuContextValue>(
    () => ({
      showContextMenu,
      hideContextMenu,
      registry,
      state,
      registerDockview,
      unregisterDockview,
      getDockviewApi,
      getDockviewIds,
      getDockviewHost,
      getDockviewHostIds,
    }),
    [
      showContextMenu,
      hideContextMenu,
      registry,
      state,
      registerDockview,
      unregisterDockview,
      getDockviewApi,
      getDockviewIds,
      getDockviewHost,
      getDockviewHostIds,
    ]
  );

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
    </ContextMenuContext.Provider>
  );
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
    return { keys: [], map: {} };
  }

  const keys = hub.registry.getExposedKeys();
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
    let current = root;
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

  let current = root;
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

// Hooks are exported from ./useContextMenu.ts for fast-refresh compatibility
