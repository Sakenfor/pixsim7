import { pixsimClient } from '@lib/api/client';

import type { PlanSummary, PlansIndexResponse } from './types';

const PAGE_SIZE = 500; // matches the endpoint's per-request cap
const MAX_PAGES = 50; // safety stop (25k plans) — never loop unbounded

/**
 * Fetch every plan from GET /dev/plans by paging to completion.
 *
 * The endpoint caps a single response at 500 rows (a payload guardrail, since
 * non-compact entries carry checkpoints/children). Reachability consumers — the
 * Plans sidebar and the chat tab-grouping title map — need *all* plans or
 * entries past the first page render as "unavailable" / dead links. Paging
 * keeps correctness independent of the cap and of the total plan count.
 *
 * Relies on the endpoint's deterministic ordering (updated_at DESC, id) so
 * offsets address a stable sequence rather than shuffling between pages.
 *
 * `compact` strips heavy fields (checkpoints/code_paths/…) — pass it when only
 * lightweight fields (id, title, topology) are needed.
 */
export async function fetchAllPlans(opts: { compact?: boolean } = {}): Promise<PlanSummary[]> {
  const compact = opts.compact ? '&compact=true' : '';
  const all: PlanSummary[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const res = await pixsimClient.get<PlansIndexResponse>(
      `/dev/plans?limit=${PAGE_SIZE}&offset=${offset}${compact}`,
    );
    const plans = res.plans ?? [];
    all.push(...plans);
    // A short page means we've reached the end.
    if (plans.length < PAGE_SIZE) break;
  }

  return all;
}
