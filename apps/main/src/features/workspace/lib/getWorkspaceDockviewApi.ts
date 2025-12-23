import type { DockviewApi } from 'dockview-core';
import { getDockviewHost } from '@lib/dockview/hostRegistry';
import { panelManager } from '@features/panels/lib/PanelManager';

export function getWorkspaceDockviewApi(): DockviewApi | undefined {
  return getDockviewHost('workspace')?.api
    ?? panelManager.getPanelState('workspace')?.dockview?.api;
}
