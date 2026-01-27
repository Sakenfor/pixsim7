/**
 * Dockview Host (app-specific wrapper)
 *
 * Re-exports shared types and provides app-specific createDockviewHost
 * that injects panelSelectors as the PanelLookup.
 */

import {
  createDockviewHost as createDockviewHostBase,
} from '@pixsim7/shared.ui.dockview';
import type { DockviewApi } from 'dockview-core';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

export type { DockviewHost } from '@pixsim7/shared.ui.dockview';

export function createDockviewHost(dockviewId: string, api: DockviewApi) {
  return createDockviewHostBase(dockviewId, api, panelSelectors);
}
