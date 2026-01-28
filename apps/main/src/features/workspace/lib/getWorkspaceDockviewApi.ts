import type { DockviewApi } from 'dockview-core';

import { panelManager } from '@features/panels/lib/PanelManager';

import { getWorkspaceDockviewHost } from './getWorkspaceDockviewHost';

export function getWorkspaceDockviewApi(): DockviewApi | undefined {
  return getWorkspaceDockviewHost()?.api
    ?? panelManager.getPanelState('workspace')?.dockview?.api;
}
