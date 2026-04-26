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
 * Check whether a panel is open in any registered dockview host in the app.
 * Used by Quick Add pins so a "pinned" shortcut grays out as "Already open"
 * even when the panel lives in a different dockview than the one the user
 * right-clicked in (e.g. media-preview inside the Asset Viewer while the
 * right-click happened in the outer workspace).
 */
export function isPanelOpenAnywhere(
  ctx: MenuActionContext,
  panelId: string,
): boolean {
  if (isPanelOpenInCurrentDockview(ctx, panelId, false)) return true;

  const hostIds = ctx.getDockviewHostIds?.() ?? ctx.getDockviewIds?.() ?? [];
  for (const id of hostIds) {
    if (id === ctx.currentDockviewId) continue;
    const host = ctx.getDockviewHost?.(id);
    if (host?.isPanelOpen(panelId, false)) return true;
    const otherApi = host?.api ?? ctx.getDockviewApi?.(id);
    if (otherApi && isPanelOpen(otherApi, panelId, false)) return true;
  }
  return false;
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
