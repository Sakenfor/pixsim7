import { pixsimClient } from '@lib/api/client';

const PAGE_SIZE = 500; // matches the endpoint's per-request cap
const MAX_PAGES = 50; // safety stop (25k plans) — never loop unbounded

/**
 * Fetch every plan from GET /dev/plans by paging to completion.
 *
 * The endpoint caps a single response at 500 rows (a payload guardrail, since
 * non-compact entries carry checkpoints/children). Consumers that need a
 * complete view — the Plans sidebar, the chat tab-grouping title map, the
 * @-reference picker — must see *all* plans or entries past the first page
 * render as "unavailable" / dead links. Paging keeps correctness independent of
 * the cap and of the total plan count.
 *
 * Relies on the endpoint's deterministic ordering (updated_at DESC, id) so
 * offsets address a stable sequence rather than shuffling between pages.
 *
 * Generic over the row shape: pass `{ compact: true }` for the lightweight
 * projection (id, title, topology), or other query params (e.g.
 * `include_hidden`) as needed. `limit`/`offset` are managed here.
 */
export async function fetchAllPlans<T>(
  params: Record<string, string | number | boolean> = {},
): Promise<T[]> {
  const all: T[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await pixsimClient.get<{ plans: T[] }>('/dev/plans', {
      params: { ...params, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    });
    const plans = res.plans ?? [];
    all.push(...plans);
    // A short page means we've reached the end.
    if (plans.length < PAGE_SIZE) break;
  }

  return all;
}
