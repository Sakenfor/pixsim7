/**
 * Panel addition and management utilities.
 *
 * Re-exports shared utilities. Panel lookup is configured globally via
 * `configurePanelLookup()` at app init, so no app-specific injection is needed.
 */

export {
  addDockviewPanel,
  ensurePanels,
  getDockviewGroupCount,
  getDockviewGroups,
  getDockviewPanels,
  findDockviewPanel,
  focusPanel,
  isPanelOpen,
  resolvePanelDefinitionId,
} from '@pixsim7/shared.ui.dockview';
export type { AddDockviewPanelOptions, EnsurePanelsOptions } from '@pixsim7/shared.ui.dockview';
