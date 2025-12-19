/**
 * Context Menu Provider
 *
 * Global React context provider for context menu state and actions.
 * Supports multiple dockviews with cross-dockview communication.
 *
 * Services are injected via props to keep the system decoupled and testable.
 */

import { createContext, useContext, useState, useCallback, type ReactNode, useRef } from 'react';
import type { DockviewApi } from 'dockview-core';
import { contextMenuRegistry, type ContextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContext } from './types';
import type { PanelRegistry } from '@features/panels/lib/panelRegistry';

/** Dockview serialized layout type */
export type DockviewLayout = ReturnType<DockviewApi['toJSON']>;

interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContext | null;
}

/** Services that can be injected into the context menu system */
export interface ContextMenuServices {
  /** Workspace store for preset management */
  workspaceStore?: any;
  /** Panel registry for querying available panels */
  panelRegistry?: PanelRegistry;
}

interface ContextMenuContextValue {
  /** Show context menu at position with given context */
  showContextMenu: (partial: Partial<MenuActionContext>) => void;
  /** Hide context menu */
  hideContextMenu: () => void;
  /** Context menu registry */
  registry: ContextMenuRegistry;
  /** Current menu state */
  state: ContextMenuState;
  /** Register a dockview instance with optional capabilities */
  registerDockview: (
    id: string,
    api: DockviewApi,
    capabilities?: {
      floatPanelHandler?: MenuActionContext['floatPanelHandler'];
    }
  ) => void;
  /** Unregister a dockview instance */
  unregisterDockview: (id: string) => void;
  /** Get a dockview API by ID */
  getDockviewApi: (id: string) => DockviewApi | undefined;
  /** Get all registered dockview IDs */
  getDockviewIds: () => string[];
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

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

  // Store services in ref to avoid recreating callbacks
  const servicesRef = useRef(services);
  servicesRef.current = services;

  // Track multiple dockview APIs by ID
  const dockviewApisRef = useRef<Map<string, DockviewApi>>(new Map());

  // Track per-dockview capabilities (like float handlers)
  const dockviewCapabilitiesRef = useRef<
    Map<string, { floatPanelHandler?: MenuActionContext['floatPanelHandler'] }>
  >(new Map());

  const registerDockview = useCallback(
    (
      id: string,
      api: DockviewApi,
      capabilities?: { floatPanelHandler?: MenuActionContext['floatPanelHandler'] }
    ) => {
      dockviewApisRef.current.set(id, api);
      if (capabilities) {
        dockviewCapabilitiesRef.current.set(id, capabilities);
      }
    },
    []
  );

  const unregisterDockview = useCallback((id: string) => {
    dockviewApisRef.current.delete(id);
    dockviewCapabilitiesRef.current.delete(id);
  }, []);

  const getDockviewApi = useCallback((id: string): DockviewApi | undefined => {
    return dockviewApisRef.current.get(id);
  }, []);

  const getDockviewIds = useCallback((): string[] => {
    return Array.from(dockviewApisRef.current.keys());
  }, []);

  const showContextMenu = useCallback((partial: Partial<MenuActionContext>) => {
    // Get current dockview API if ID provided
    const currentDockviewId = partial.currentDockviewId;
    const currentApi = currentDockviewId ? dockviewApisRef.current.get(currentDockviewId) : undefined;

    // Get capabilities for current dockview
    const capabilities = currentDockviewId ? dockviewCapabilitiesRef.current.get(currentDockviewId) : undefined;

    // Build full context with injected services and dockview capabilities
    const fullContext: MenuActionContext = {
      contextType: partial.contextType!,
      position: partial.position!,
      data: partial.data,
      currentDockviewId,
      getDockviewApi,
      // Convenience: set api to current dockview's API
      api: currentApi,
      // Inject global services from props
      workspaceStore: servicesRef.current.workspaceStore,
      panelRegistry: servicesRef.current.panelRegistry,
      // Inject dockview-specific capabilities
      floatPanelHandler: capabilities?.floatPanelHandler,
      ...partial,
    };

    setState({ isOpen: true, context: fullContext });
  }, [getDockviewApi]);

  const hideContextMenu = useCallback(() => {
    setState({ isOpen: false, context: null });
  }, []);

  const value: ContextMenuContextValue = {
    showContextMenu,
    hideContextMenu,
    registry,
    state,
    registerDockview,
    unregisterDockview,
    getDockviewApi,
    getDockviewIds,
  };

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
    </ContextMenuContext.Provider>
  );
}

/**
 * Hook to access context menu functionality
 *
 * @throws Error if used outside of ContextMenuProvider
 */
export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

/**
 * Hook to check if context menu is available (optional usage)
 *
 * Returns null if outside provider, allowing components to work
 * with or without context menu support.
 */
export function useContextMenuOptional() {
  return useContext(ContextMenuContext);
}
