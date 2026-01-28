/**
 * Dockview context menu context builders.
 *
 * Centralizes the shared fields used by dockview context menu calls so callers
 * only provide event-specific overrides.
 */

import type { DockviewApi } from 'dockview-core';

import type { ContextHubState } from '@features/contextHub';

import type { ContextMenuContext, MenuActionContext, PanelRegistryLike } from './types';

export interface DockviewContextBase {
  currentDockviewId?: string;
  api?: DockviewApi;
  panelRegistry?: PanelRegistryLike;
  resetDockviewLayout?: () => void;
  contextHubState?: ContextHubState | null;
}

export interface DockviewContextOverrides {
  contextType: ContextMenuContext;
  position: { x: number; y: number };
  panelId?: string;
  instanceId?: string;
  groupId?: string;
  data?: unknown;
}

export function buildDockviewContext(
  base: DockviewContextBase,
  overrides: DockviewContextOverrides,
): Partial<MenuActionContext> {
  return {
    ...base,
    ...overrides,
  };
}
