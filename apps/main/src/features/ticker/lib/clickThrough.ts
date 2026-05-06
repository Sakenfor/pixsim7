/**
 * Ticker event click-through.
 *
 * Mirrors the navigation pattern used by `NotificationActivityBarWidget`
 * (`apps/main/src/features/notifications/components/NotificationActivityBarWidget.tsx`)
 * so the ticker and the activity-bar notifications widget stay in lockstep
 * — same `refType` → same destination.
 *
 * Add a new entry to `getNavigationTarget` here and in the notifications
 * widget when you introduce a new ref-type so both surfaces handle it.
 */

import { navigateToPlan } from '@features/workspace/lib/openPanel';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import type { TickerEvent } from './sourceRegistry';

/** Map a ref-type to the panel that should open. Returns null if unknown. */
function getNavigationTarget(refType: string): { panelId: string } | null {
  switch (refType) {
    case 'plan':
      return { panelId: 'plans' };
    case 'generation':
      return { panelId: 'generation-history' };
    case 'document':
      return { panelId: 'plans' };
    default:
      return null;
  }
}

/**
 * Handle a click on a ticker event. Returns `true` if the click was
 * actionable (a panel opened or navigation happened), `false` if the event
 * had no usable target.
 */
export function handleTickerEventClick(event: TickerEvent): boolean {
  // Explicit href escape-hatch — only used for sources that genuinely don't
  // map to a typed entity (rare; prefer refType+refId).
  if (event.href) {
    if (event.href.startsWith('http://') || event.href.startsWith('https://')) {
      window.open(event.href, '_blank', 'noopener,noreferrer');
      return true;
    }
    // SPA-relative — push onto history and let react-router pick it up.
    window.history.pushState({}, '', event.href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return true;
  }

  if (!event.refType) return false;

  // Plan navigation has a dedicated helper that focuses the specific plan.
  if (event.refType === 'plan' && event.refId) {
    navigateToPlan(event.refId);
    return true;
  }

  const target = getNavigationTarget(event.refType);
  if (!target) return false;

  useWorkspaceStore.getState().openFloatingPanel(target.panelId as never);
  return true;
}
