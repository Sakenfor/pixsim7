import { useEffect, useRef, useState } from 'react';

import {
  listTabPlanClaims,
  type TabPlanClaim,
} from './chatTabsApi';

const POLL_MS = 30_000;

/**
 * Per-tab multi-plan membership for the chat header (ContextBar).
 *
 * Source of truth is the participant-claim ledger keyed by the tab's bound
 * session, so a plan an MCP agent self-assigned in this session shows up
 * even though the user never typed `@plan:`. Light 30s poll (mirrors
 * useActiveAgentsRoster) so an out-of-band self-assign surfaces while the
 * user is looking; also refetches whenever the active tab, its primary
 * binding, or its session changes. Single-flight per current tab.
 *
 * Plan `plan-participant-liveness` / `unify-tab-plan-categorization`.
 */
export function useTabPlanClaims(
  tabId: string | null,
  // Refetch keys — change when the binding the server derives from changes.
  planId: string | null,
  sessionId: string | null,
  // False while the tab's optimistic-create POST is in flight (or failed) —
  // the server has no row for this id yet, so a fetch would 404. Flips true
  // (and the effect re-runs → fetches) once the create is confirmed.
  persisted = true,
): TabPlanClaim[] {
  const [plans, setPlans] = useState<TabPlanClaim[]>([]);
  const inflight = useRef(false);

  useEffect(() => {
    // Skip the fetch for an unbound tab (no plan binding and no bound
    // session). The server's only non-empty paths require either
    // session-keyed claim rows or a derived primary `plan_id`, so such a tab
    // can have no claims — return [] without a request.
    //
    // Also skip while the tab isn't yet persisted server-side: a new tab is
    // inserted optimistically with a client-minted id and the panel renders
    // (firing this hook) before the `POST /chat-tabs` lands, so
    // `GET /{id}/plan-claims` would 404 on a tab the server hasn't seen yet.
    // This covers pre-bound tabs (resume / agent self-assign) where the
    // unbound guard above wouldn't. Plan `unify-tab-plan-categorization`.
    if (!tabId || !persisted || (!planId && !sessionId)) {
      setPlans([]);
      return;
    }
    // Drop the previous tab's chips immediately so they don't flash on the
    // new tab before the first fetch resolves.
    setPlans([]);
    let cancelled = false;

    const fetchClaims = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const res = await listTabPlanClaims(tabId);
        if (!cancelled) setPlans(res.plans);
      } catch {
        // Best-effort: header chips are non-critical; keep last good value.
      } finally {
        inflight.current = false;
      }
    };

    void fetchClaims();
    const t = setInterval(() => void fetchClaims(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tabId, planId, sessionId, persisted]);

  return plans;
}
