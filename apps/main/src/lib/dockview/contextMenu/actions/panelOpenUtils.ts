import { addDockviewPanel, isPanelOpen } from '../../panelAdd';
import { resolveCurrentDockview } from '../resolveCurrentDockview';
import type { MenuActionContext } from '../types';

type DockviewAddOptions = Parameters<typeof addDockviewPanel>[2];

/**
 * Check whether a panel is open in the currently resolved dockview context.
 */
export function isPanelOpenInCurrentDockview(
  ctx: MenuActionContext,
  panelId: string,
  allowMultiple = false,
): boolean {
  const { api, host } = resolveCurrentDockview(ctx);
  if (!api) return false;
  return host?.isPanelOpen(panelId, allowMultiple) ?? isPanelOpen(api, panelId, allowMultiple);
}

/**
 * Add/open a panel in the currently resolved dockview context.
 * Uses host APIs when available, otherwise falls back to api-based helper.
 */
export function addPanelInCurrentDockview(
  ctx: MenuActionContext,
  panelId: string,
  options: DockviewAddOptions = {},
): string | null | undefined {
  const { api, host } = resolveCurrentDockview(ctx);
  if (!api) return null;

  if (host) {
    return host.addPanel(panelId, options);
  }

  return addDockviewPanel(api, panelId, options);
}
