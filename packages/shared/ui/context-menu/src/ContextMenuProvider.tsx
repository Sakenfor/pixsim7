/**
 * Context Menu Provider (shared, app-agnostic)
 *
 * Manages context menu state and provides access to menu actions.
 * Capabilities are injected via capabilitiesProvider prop.
 */

import type { DockviewApi } from 'dockview-core';
import {
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  useRef,
  useSyncExternalStore,
} from 'react';

import {
  createDockviewHost,
  getDockviewHost as getHostFromRegistry,
  getDockviewApi as getApiFromRegistry,
  getDockviewHostIds as getHostIdsFromRegistry,
  getDockviewCapabilities,
  registerDockviewHost as registerInRegistry,
  unregisterDockviewHost as unregisterFromRegistry,
  type DockviewHost,
  type DockviewCapabilities,
} from '@pixsim7/shared.ui.dockview';

import { ContextMenuContext, type ContextMenuContextValue } from './ContextMenuContext';
import { contextMenuRegistry } from './ContextMenuRegistry';
import type { ContextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContextBase, CapabilitiesSnapshotProvider, PanelRegistryLike } from './types';

const emptySnapshot = { keys: [] as string[], map: {} as Record<string, unknown> };
const noop = () => () => {};

export type DockviewLayout = ReturnType<DockviewApi['toJSON']>;

interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContextBase | null;
}

export interface ContextMenuServices {
  workspaceStore?: unknown;
  panelRegistry?: PanelRegistryLike;
}

interface ContextMenuProviderProps {
  children: ReactNode;
  registry?: ContextMenuRegistry;
  services?: ContextMenuServices;
  capabilitiesProvider?: CapabilitiesSnapshotProvider;
}

export function ContextMenuProvider({
  children,
  registry = contextMenuRegistry,
  services = {},
  capabilitiesProvider,
}: ContextMenuProviderProps) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    context: null,
  });

  const capabilitiesSnapshot = useSyncExternalStore(
    capabilitiesProvider?.subscribe ?? noop,
    () => capabilitiesProvider?.getSnapshot() ?? emptySnapshot,
  );

  const servicesRef = useRef(services);
  servicesRef.current = services;

  const capabilitiesSnapshotRef = useRef(capabilitiesSnapshot);
  capabilitiesSnapshotRef.current = capabilitiesSnapshot;

  const registerDockview = useCallback(
    (id: string, api: DockviewApi, capabilities?: DockviewCapabilities) => {
      const host = createDockviewHost(id, api);
      registerInRegistry(host, capabilities);
    },
    []
  );

  const unregisterDockview = useCallback((id: string) => {
    unregisterFromRegistry(id);
  }, []);

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

  const showContextMenu = useCallback((partial: Partial<MenuActionContextBase>) => {
    const currentDockviewId = partial.currentDockviewId;
    const currentApi = currentDockviewId ? getApiFromRegistry(currentDockviewId) : undefined;
    const dockviewCaps = currentDockviewId ? getDockviewCapabilities(currentDockviewId) : undefined;

    const fullContext: MenuActionContextBase = {
      contextType: partial.contextType!,
      position: partial.position!,
      data: partial.data,
      capabilities: capabilitiesSnapshotRef.current.map,
      currentDockviewId,
      getDockviewApi,
      getDockviewIds,
      getDockviewHost,
      getDockviewHostIds,
      workspaceStore: servicesRef.current.workspaceStore,
      panelRegistry: servicesRef.current.panelRegistry,
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
