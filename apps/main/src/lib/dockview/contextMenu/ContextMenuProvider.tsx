/**
 * Context Menu Provider (app-specific wrapper)
 *
 * Wraps shared ContextMenuProvider with app-specific capabilities injection.
 */


import {
  ContextMenuProvider as BaseContextMenuProvider,
  type ContextMenuServices,
} from '@pixsim7/shared.ui.context-menu';
import type { ContextMenuRegistry } from '@pixsim7/shared.ui.context-menu';
import type { ReactNode } from 'react';

import type { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { useCapabilitiesSnapshotProvider } from '../contextMenuAdapter';

import type { PanelRegistryLike } from './types';

export type { DockviewLayout } from '@pixsim7/shared.ui.context-menu';

/** Services that can be injected into the context menu system */
export interface AppContextMenuServices {
  workspaceStore?: typeof useWorkspaceStore;
  panelRegistry?: PanelRegistryLike;
}

interface ContextMenuProviderProps {
  children: ReactNode;
  registry?: ContextMenuRegistry;
  services?: AppContextMenuServices;
}

export function ContextMenuProvider({
  children,
  registry,
  services = {},
}: ContextMenuProviderProps) {
  const capsProvider = useCapabilitiesSnapshotProvider();

  return (
    <BaseContextMenuProvider
      registry={registry}
      services={services as ContextMenuServices}
      capabilitiesProvider={capsProvider}
    >
      {children}
    </BaseContextMenuProvider>
  );
}
