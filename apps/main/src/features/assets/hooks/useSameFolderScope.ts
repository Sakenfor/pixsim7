/**
 * useSameFolderScope
 *
 * "Same folder" media-viewer navigation scope: every asset that originated
 * from the pivot's tracked local folder (same `source_folder_id` +
 * `source_subfolder`), ordered by `created_at`, so the existing bottom-bar
 * chevrons / swipe / scope-switcher walk a folder cohort.
 *
 * A thin `createCohortScope` instantiation, sibling to `useSamePromptScope`.
 * The folder identity is the upload pipeline's `upload_context.source_folder_id`
 * (the user-facing tracked folder, NOT the backend `local_path`). When the
 * pivot carries that context we filter by it directly; otherwise, for assets
 * uploaded via the local pipeline that don't carry the context in-memory, we
 * fall back to the server-resolved `source_siblings_of_asset_id` (the backend
 * looks up the pivot's folder/subfolder itself). `isEligible` skips assets with
 * no folder signal at all (generated assets, plain uploads, captures).
 *
 * Unlike the input-slot "Source" cohort, this does NOT filter by media_type —
 * a viewer is browse-oriented, so a mixed-media folder should walk in full.
 *
 * Must be mounted exactly once at app level (singleton constraint inherited
 * from `createCohortScope`).
 */

import { listAssets } from '@lib/api/assets';

import { fromAssetResponses, type AssetModel } from '../models/asset';

import { createCohortScope } from './createCohortScope';

/** Backend `AssetSearchRequest.limit` is `le=100` (Pydantic → 422 if exceeded). */
const MAX_COHORT = 100;

function readSourceFolder(pivot: AssetModel): { folderId?: string; subfolder?: string } {
  const ctx = pivot.uploadContext as Record<string, unknown> | null | undefined;
  if (!ctx) return {};
  const folderId = typeof ctx.source_folder_id === 'string' && ctx.source_folder_id ? ctx.source_folder_id : undefined;
  const subfolder = typeof ctx.source_subfolder === 'string' ? ctx.source_subfolder : undefined;
  return { folderId, subfolder };
}

function isFolderSourced(pivot: AssetModel): boolean {
  return Boolean(readSourceFolder(pivot).folderId) || pivot.uploadMethod === 'local';
}

async function fetchSameFolder(pivot: AssetModel): Promise<AssetModel[]> {
  const { folderId, subfolder } = readSourceFolder(pivot);
  // Newest-first so the cap clips the oldest tail (keeping the pivot in-cohort),
  // then reverse so the scope reads oldest → newest like the other cohorts.
  const base = {
    sort_by: 'created_at' as const,
    sort_dir: 'desc' as const,
    limit: MAX_COHORT,
  };
  let query: Record<string, unknown>;
  if (folderId) {
    query = {
      ...base,
      upload_source_folder_id: folderId,
      ...(subfolder !== undefined ? { upload_source_subfolder: subfolder } : {}),
    };
  } else if (pivot.uploadMethod === 'local') {
    // Backend resolves the pivot's folder + subfolder from its upload_context.
    query = { ...base, source_siblings_of_asset_id: pivot.id };
  } else {
    return [];
  }
  const res = await listAssets(query);
  return fromAssetResponses(res.assets).reverse();
}

export const useSameFolderScope = createCohortScope({
  scopeId: 'same-folder',
  cacheKey: 'viewer:sameFolderScopeCache',
  label: (n) => `Same folder (${n})`,
  isEligible: isFolderSourced,
  fetchCohort: fetchSameFolder,
});
