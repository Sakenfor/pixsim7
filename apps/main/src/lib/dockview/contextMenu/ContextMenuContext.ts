/**
 * Context Menu Context
 *
 * React context for context menu functionality.
 * Separated from ContextMenuProvider for fast-refresh compatibility.
 */

import type { DockviewApi } from 'dockview-core';
import { createContext } from 'react';

import type { DockviewHost } from '../host';
import type { DockviewCapabilities } from '../hostRegistry';

import type { ContextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContext } from './types';


interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContext | null;
}

export interface ContextMenuContextValue {
  /** Show context menu at position with given context */
  showContextMenu: (partial: Partial<MenuActionContext>) => void;
  /** Hide context menu */
  hideContextMenu: () => void;
  /** Context menu registry */
  registry: ContextMenuRegistry;
  /** Current menu state */
  state: ContextMenuState;
  /**
   * Register a dockview instance with optional capabilities.
   * Delegates to the central hostRegistry.
   */
  registerDockview: (
    id: string,
    api: DockviewApi,
    capabilities?: DockviewCapabilities
  ) => void;
  /**
   * Unregister a dockview instance.
   * Delegates to the central hostRegistry.
   */
  unregisterDockview: (id: string) => void;
  /** Get a dockview API by ID (delegates to hostRegistry) */
  getDockviewApi: (id: string) => DockviewApi | undefined;
  /** Get all registered dockview IDs (delegates to hostRegistry) */
  getDockviewIds: () => string[];
  /** Get a dockview host by ID (delegates to hostRegistry) */
  getDockviewHost: (id: string) => DockviewHost | undefined;
  /** Get all registered dockview host IDs (delegates to hostRegistry) */
  getDockviewHostIds: () => string[];
}

export const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);
