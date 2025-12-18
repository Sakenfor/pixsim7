/**
 * Context Menu Provider
 *
 * React context provider for dockview context menu state and actions.
 */

import { createContext, useContext, useState, useCallback, type ReactNode, useRef } from 'react';
import type { DockviewApi } from 'dockview-core';
import { panelRegistry } from '@features/panels';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';
import { contextMenuRegistry, type ContextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContext } from './types';

interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContext | null;
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
  /** Set dockview API reference */
  setDockviewApi: (api: DockviewApi | null) => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

interface ContextMenuProviderProps {
  children: ReactNode;
  registry?: ContextMenuRegistry;
}

/**
 * Context Menu Provider Component
 *
 * Manages context menu state and provides access to menu actions.
 * Must wrap SmartDockview to enable context menu functionality.
 */
export function ContextMenuProvider({
  children,
  registry = contextMenuRegistry,
}: ContextMenuProviderProps) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    context: null,
  });

  // Store dockview API ref
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  const setDockviewApi = useCallback((api: DockviewApi | null) => {
    dockviewApiRef.current = api;
  }, []);

  const showContextMenu = useCallback((partial: Partial<MenuActionContext>) => {
    // Build full context - only include dockview fields if API is available
    const fullContext: MenuActionContext = {
      contextType: partial.contextType!,
      position: partial.position!,
      data: partial.data,
      ...partial, // Include all custom fields
    };

    // Add dockview-specific fields if API is available
    if (dockviewApiRef.current) {
      fullContext.api = dockviewApiRef.current;
      fullContext.workspaceStore = useWorkspaceStore;
      fullContext.panelRegistry = panelRegistry;
    }

    setState({ isOpen: true, context: fullContext });
  }, []);

  const hideContextMenu = useCallback(() => {
    setState({ isOpen: false, context: null });
  }, []);

  const value: ContextMenuContextValue = {
    showContextMenu,
    hideContextMenu,
    registry,
    state,
    setDockviewApi,
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
