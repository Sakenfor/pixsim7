/**
 * Dockview Host - Re-exported from shared package.
 *
 * Panel lookup is configured globally via `configurePanelLookup()` at app init,
 * so no app-specific injection wrapper is needed.
 */

export { createDockviewHost } from '@pixsim7/shared.ui.dockview';
export type { DockviewHost } from '@pixsim7/shared.ui.dockview';
