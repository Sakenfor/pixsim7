import { resolveDockviewHost, type DockviewHost } from '@lib/dockview';

import { panelManager } from '@features/panels/lib/PanelManager';

export function getWorkspaceDockviewHost(): DockviewHost | undefined {
  return resolveDockviewHost(
    'workspace',
    panelManager.getPanelState('workspace')?.dockview?.host,
  );
}
