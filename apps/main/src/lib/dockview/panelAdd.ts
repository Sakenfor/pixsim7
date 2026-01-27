/**
 * Panel addition and management utilities (app-specific wrapper)
 *
 * Re-exports shared utilities and provides app-specific addDockviewPanel
 * that injects panelSelectors as the PanelLookup.
 */

import {
  addDockviewPanel as addDockviewPanelBase,
  findDockviewPanel,
  focusPanel,
  isPanelOpen,
  resolvePanelDefinitionId,
  type AddDockviewPanelOptions,
} from '@pixsim7/shared.ui.dockview';
import type { DockviewApi } from 'dockview-core';

import { panelSelectors } from '@lib/plugins/catalogSelectors';


export type { AddDockviewPanelOptions } from '@pixsim7/shared.ui.dockview';
export { findDockviewPanel, focusPanel, isPanelOpen, resolvePanelDefinitionId };

export function addDockviewPanel(
  api: DockviewApi,
  panelId: string,
  options: AddDockviewPanelOptions = {},
): string | null {
  return addDockviewPanelBase(api, panelId, options, panelSelectors);
}
