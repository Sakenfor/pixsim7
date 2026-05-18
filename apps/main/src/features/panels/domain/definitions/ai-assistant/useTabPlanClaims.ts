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
): TabPlanClaim[] {
  const [plans, setPlans] = useState<TabPlanClaim[]>([]);
  const inflight = useRef(false);

  useEffect(() => {
    if (!tabId) {
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
  }, [tabId, planId, sessionId]);

  return plans;
}
