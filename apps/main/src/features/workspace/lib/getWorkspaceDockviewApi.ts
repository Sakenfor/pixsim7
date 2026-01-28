import type { DockviewApi } from 'dockview-core';

import { resolveDockviewApi } from '@lib/dockview';

import { panelManager } from '@features/panels/lib/PanelManager';


import { getWorkspaceDockviewHost } from './getWorkspaceDockviewHost';

export function getWorkspaceDockviewApi(): DockviewApi | undefined {
  return resolveDockviewApi(
    'workspace',
    panelManager.getPanelState('workspace')?.dockview?.api,
    getWorkspaceDockviewHost(),
  );
}
