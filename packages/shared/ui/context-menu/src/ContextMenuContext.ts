/**
 * Context Menu Context
 *
 * React context for context menu functionality.
 * Separated from ContextMenuProvider for fast-refresh compatibility.
 */

import type { DockviewApi } from 'dockview-core';
import { createContext } from 'react';

import type { DockviewHost } from '@pixsim7/shared.ui.dockview';
import type { DockviewCapabilities } from '@pixsim7/shared.ui.dockview';

import type { ContextMenuRegistry } from './ContextMenuRegistry';
import type { MenuActionContextBase } from './types';


interface ContextMenuState {
  isOpen: boolean;
  context: MenuActionContextBase | null;
}

export interface ContextMenuContextValue {
  showContextMenu: (partial: Partial<MenuActionContextBase>) => void;
  hideContextMenu: () => void;
  registry: ContextMenuRegistry;
  state: ContextMenuState;
  registerDockview: (
    id: string,
    api: DockviewApi,
    capabilities?: DockviewCapabilities
  ) => void;
  unregisterDockview: (id: string) => void;
  getDockviewApi: (id: string) => DockviewApi | undefined;
  getDockviewIds: () => string[];
  getDockviewHost: (id: string) => DockviewHost | undefined;
  getDockviewHostIds: () => string[];
}

export const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);
