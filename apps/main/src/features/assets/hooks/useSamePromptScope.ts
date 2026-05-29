/**
 * useSamePromptScope
 *
 * "Same prompt" media-viewer navigation scope: every asset sharing the
 * pivot's `prompt_version_id`, ordered by `created_at`, so the existing
 * bottom-bar chevrons / swipe / scope-switcher walk a prompt cohort.
 *
 * A thin `createCohortScope` instantiation. The cohort key is
 * `prompt_version_id` (a stable prompt-version FK, not brittle prompt text);
 * `isEligible` skips the fetch entirely for assets with no prompt version
 * (uploads, captures, pre-analysis assets).
 *
 * Must be mounted exactly once at app level (singleton constraint inherited
 * from `createCohortScope`).
 */

import { listAssets } from '@lib/api/assets';

import { fromAssetResponses, type AssetModel } from '../models/asset';

import { createCohortScope } from './createCohortScope';

/**
 * Cohort cap — backend `AssetSearchRequest.limit` is `le=100` (Pydantic
 * validator → 422 if exceeded). A single prompt version rarely yields more
 * than ~dozens of assets, so the cap is generous in practice.
 */
const MAX_COHORT = 100;

async function fetchSamePrompt(pivot: AssetModel): Promise<AssetModel[]> {
  const promptVersionId = pivot.promptVersionId;
  if (!promptVersionId) return [];
  // Fetch newest-first so the cap clips the *oldest* tail (likely older than
  // the pivot anyway) rather than dropping recent assets — which would
  // exclude the pivot itself from the cohort and disable the chevrons.
  // Then reverse client-side so the scope reads oldest → newest, matching
  // how chevrons/swipe walk a scope list.
  const res = await listAssets({
    prompt_version_id: promptVersionId,
    sort_by: 'created_at' as const,
    sort_dir: 'desc' as const,
    limit: MAX_COHORT,
  });
  return fromAssetResponses(res.assets).reverse();
}

export const useSamePromptScope = createCohortScope({
  scopeId: 'same-prompt',
  cacheKey: 'viewer:samePromptScopeCache',
  label: (n) => `Same prompt (${n})`,
  isEligible: (pivot) => Boolean(pivot.promptVersionId),
  fetchCohort: fetchSamePrompt,
});
