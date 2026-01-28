/**
 * Panel addition and management utilities (app-specific wrapper)
 *
 * Re-exports shared utilities and provides app-specific addDockviewPanel
 * that injects panelSelectors as the PanelLookup.
 */

import {
  addDockviewPanel as addDockviewPanelBase,
  ensurePanels as ensurePanelsBase,
  getDockviewPanels,
  findDockviewPanel,
  focusPanel,
  isPanelOpen,
  resolvePanelDefinitionId,
  type AddDockviewPanelOptions,
  type EnsurePanelsOptions,
} from '@pixsim7/shared.ui.dockview';
import type { DockviewApi } from 'dockview-core';

import { panelSelectors } from '@lib/plugins/catalogSelectors';


export type { AddDockviewPanelOptions, EnsurePanelsOptions } from '@pixsim7/shared.ui.dockview';
export { getDockviewPanels, findDockviewPanel, focusPanel, isPanelOpen, resolvePanelDefinitionId };

export function addDockviewPanel(
  api: DockviewApi,
  panelId: string,
  options: AddDockviewPanelOptions = {},
): string | null {
  return addDockviewPanelBase(api, panelId, options, panelSelectors);
}

export function ensurePanels(
  api: DockviewApi,
  panelIds: Iterable<string>,
  options: EnsurePanelsOptions = {},
): string[] {
  return ensurePanelsBase(api, panelIds, options, panelSelectors);
}
