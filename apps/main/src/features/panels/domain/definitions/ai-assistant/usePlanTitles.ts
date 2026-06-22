import { useEffect, useState } from 'react';

import { fetchAllPlans } from '@features/panels/components/dev/plans/detail/fetchAllPlans';
import { isCanonicalPlanId } from '@features/panels/components/dev/plans/detail/types';

const POLL_MS = 60_000;

/**
 * id → title map for plans, for the chat sidebar's plan-group headers.
 *
 * Mirrors `PlansPanel.loadPlans` (bare `GET /dev/plans`, then canonical-id
 * filter) so membership in this map is equivalent to "the Plans panel can
 * open it". A grouped plan id absent from the map is a dead link — the
 * sidebar renders it non-navigable instead of bouncing the user into the
 * panel's "Selected plan is unavailable" state. Plans change rarely, so a
 * slow 60s refresh keeps freshly-created plans resolvable without a heavy
 * poll. Best-effort: failures keep the last good map (empty until first ok).
 */
export function usePlanTitles(): Map<string, string> {
  const [titles, setTitles] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    let cancelled = false;

    const fetchTitles = async () => {
      try {
        // Page through *every* plan (compact — only id + title needed). This map
        // must cover all plans or grouped tabs for plans past the first page
        // render as dead links.
        const plans = await fetchAllPlans({ compact: true });
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const p of plans) {
          if (isCanonicalPlanId(p.id)) next.set(p.id, p.title);
        }
        setTitles(next);
      } catch {
        // Keep last good map; headers fall back to the raw plan id.
      }
    };

    void fetchTitles();
    const t = setInterval(() => void fetchTitles(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return titles;
}
