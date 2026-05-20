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

/** Cohort cap — a single prompt rarely yields more than a few hundred assets. */
const MAX_COHORT = 300;

async function fetchSamePrompt(pivot: AssetModel): Promise<AssetModel[]> {
  const promptVersionId = pivot.promptVersionId;
  if (!promptVersionId) return [];
  const res = await listAssets({
    prompt_version_id: promptVersionId,
    sort_by: 'created_at' as const,
    sort_dir: 'asc' as const,
    limit: MAX_COHORT,
  });
  // Ascending by created_at already; the pivot is part of the cohort (shares
  // its own prompt_version_id) so no manual insertion is needed.
  return fromAssetResponses(res.assets);
}

export const useSamePromptScope = createCohortScope({
  scopeId: 'same-prompt',
  cacheKey: 'viewer:samePromptScopeCache',
  label: (n) => `Same prompt (${n})`,
  isEligible: (pivot) => Boolean(pivot.promptVersionId),
  fetchCohort: fetchSamePrompt,
});
