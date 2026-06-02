/**
 * useInputSlotNavigation
 *
 * Single source of truth for input-slot prev/next walk. Consumers (chevron
 * widget + `useInputSlotShortcuts` for `[`/`]`/wheel/swipe) all read from
 * here so every affordance stays in lockstep and shares one underlying
 * neighbor lookup.
 *
 * Three cohort branches (all hooks always called per rules-of-hooks; only one
 * is active at a time):
 *   - **set cohort** (when `assetSetRef` present): walks the resolved set
 *     members via `useResolvedAssetSet`; `commit` pins via
 *     `pinAssetSetMember` (atomic mode='locked' + lockedAssetId + display
 *     swap). Decided with user: walking always pins.
 *   - **time/source-prompt cohort** (no `assetSetRef`, asset NOT local):
 *     walks `created_at` filtered by `media_type` (+ operationType for
 *     `time`; + `promptVersionId` for `source`); `commit` is
 *     `replaceInputAsset`.
 *   - **source-folder cohort** (no `assetSetRef`, asset IS LocalAssetModel
 *     under the `source` cohort): walks same-folder + same-directory
 *     siblings via `useLocalFolderSiblings`; `commit` is `replaceInputAsset`.
 *
 * Plan: `set-slot-walk-and-grid` (set branch); `media-card-input-time-nav`
 * + `same-prompt-cohort-nav` (time/source branch).
 */

import { useMemo } from 'react';

import {
  isLocalAssetModel,
  useAssetSequence,
  useResolvedAssetSet,
  type AssetModel,
} from '@features/assets';
import { useHasLocalFolderOrigin, useLocalFolderSiblings } from '@features/assets/hooks/useLocalFolderSiblings';
import {
  useGenerationScopeStores,
  type AssetSetSlotRef,
  type InputNavCohort,
} from '@features/generation';

import type { OperationType } from '@/types/operations';

export interface UseInputSlotNavArgs {
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
  enabled?: boolean;
}

export interface UseInputSlotNavResult {
  prev: AssetModel | null;
  next: AssetModel | null;
  isLoadingPrev: boolean;
  isLoadingNext: boolean;
  /** Commit a target (typically `prev` or `next`) — cohort-appropriate write. */
  commit: (target: AssetModel) => void;
}

/**
 * Translate the active nav cohort into `useAssetSequence` filters. Shared so
 * the chevrons, the wheel handler, and `useInputSlotShortcuts` all walk the
 * same axis.
 *
 * `source` falls back to the `time` shape when the pivot has no
 * `promptVersionId` AND isn't a local-folder asset (uploads/captures with no
 * source signal), so navigation never dead-ends — the cohort pill is
 * disabled in that case so the user can't actually pick an empty source.
 * Local-folder assets short-circuit `useAssetSequence` entirely and use
 * `useLocalFolderSiblings` instead.
 */
/**
 * Pull the tracked-folder identity from the upload pipeline's context.
 * `Asset.local_path` is the BACKEND storage path (e.g.
 * `G:\\code\\pixsim7\\data\\media\\u\\1\\content\\...`) and not the user's
 * folder — the local-folder uploader stores the user-facing identity in
 * `upload_context.source_folder_id` / `.source_subfolder`.
 */
function readUploadSource(asset: AssetModel): { folderId?: string; subfolder?: string } {
  const ctx = asset.uploadContext as Record<string, unknown> | null | undefined;
  if (!ctx) return {};
  const folderId = typeof ctx.source_folder_id === 'string' ? ctx.source_folder_id : undefined;
  const subfolder = typeof ctx.source_subfolder === 'string' ? ctx.source_subfolder : undefined;
  return { folderId, subfolder };
}

export function resolveCohortFilters(
  asset: AssetModel,
  cohort: InputNavCohort,
): {
  mediaType?: string;
  operationType?: string;
  promptVersionId?: string;
  uploadSourceFolderId?: string;
  uploadSourceSubfolder?: string;
  sourceSiblingsOfAssetId?: number;
} {
  if (cohort === 'source') {
    // If we have the upload context on hand (full asset payload), filter by
    // the source folder/subfolder directly — saves the backend a subquery.
    // Otherwise fall back to `sourceSiblingsOfAssetId` so the backend looks
    // up the pivot's upload_context itself; that works for carousel slots
    // whose asset model may be a partial / not-yet-fully-hydrated stub.
    const { folderId, subfolder } = readUploadSource(asset);
    if (folderId) {
      return {
        mediaType: asset.mediaType,
        uploadSourceFolderId: folderId,
        ...(subfolder !== undefined ? { uploadSourceSubfolder: subfolder } : {}),
      };
    }
    if (asset.uploadMethod === 'local') {
      return {
        mediaType: asset.mediaType,
        sourceSiblingsOfAssetId: asset.id,
      };
    }
    if (asset.promptVersionId) {
      return { mediaType: asset.mediaType, promptVersionId: asset.promptVersionId };
    }
  }
  return {
    mediaType: asset.mediaType,
    operationType: asset.operationType ?? undefined,
  };
}

export function useInputSlotNavigation({
  asset,
  inputId,
  operationType,
  assetSetRef,
  enabled = true,
}: UseInputSlotNavArgs): UseInputSlotNavResult {
  const isSetMode = Boolean(assetSetRef);
  const { useInputStore } = useGenerationScopeStores();
  const replaceInputAsset = useInputStore((s) => s.replaceInputAsset);
  const pinAssetSetMember = useInputStore((s) => s.pinAssetSetMember);
  // Normalize legacy persisted `'prompt'` (the old cohort name) to `'source'`.
  const cohort = useInputStore((s) => {
    const raw = s.navCohortByOperation[operationType];
    if ((raw as string) === 'prompt') return 'source';
    return raw ?? 'time';
  });

  // Source-folder LOCAL branch (cohort='source' AND asset is directly a
  // LocalAssetModel — i.e., an unuploaded file in the LocalFolders sidebar).
  // Walks the in-memory store synchronously. Backend-uploaded local assets
  // (with `localPath` set) fall through to the seq branch with the
  // `localPathPrefix` filter, so they can walk siblings without their source
  // folder being loaded in the sidebar.
  // Touch hasLocalOrigin so the cohort pill + this hook stay in lockstep on
  // detection (and to keep the hook order stable across renders).
  useHasLocalFolderOrigin(asset);
  const useFolderLocal =
    !isSetMode && enabled && cohort === 'source' && isLocalAssetModel(asset);

  // Time / source-prompt / source-folder-backend branch — inert in set mode
  // AND when the local folder branch owns the walk. The filter shape decides
  // which query the backend runs (mediaType+operationType vs promptVersionId
  // vs localPathPrefix).
  const seqEnabled = !isSetMode && enabled && !useFolderLocal;
  const seq = useAssetSequence({
    pivot: seqEnabled ? asset : null,
    filters: resolveCohortFilters(asset, cohort),
    windowBefore: 1,
    windowAfter: 1,
    enabled: seqEnabled,
  });

  // Source-folder LOCAL siblings — inert unless useFolderLocal is true.
  const folderSibs = useLocalFolderSiblings({
    pivot: useFolderLocal ? asset : null,
    enabled: useFolderLocal,
  });

  // Set branch — inert when `undefined` setId.
  const { members, isLoading: isLoadingMembers } = useResolvedAssetSet(
    isSetMode && assetSetRef ? assetSetRef.setId : undefined,
  );

  return useMemo<UseInputSlotNavResult>(() => {
    if (isSetMode && assetSetRef) {
      const currentId = assetSetRef.lockedAssetId ?? asset.id;
      const idx = members.findIndex((m) => m.id === currentId);
      const prev = idx > 0 ? members[idx - 1] : null;
      const next =
        idx >= 0 && idx < members.length - 1 ? members[idx + 1] : null;
      return {
        prev,
        next,
        isLoadingPrev: isLoadingMembers,
        isLoadingNext: isLoadingMembers,
        commit: (target) => pinAssetSetMember(operationType, inputId, target),
      };
    }
    const src = useFolderLocal ? folderSibs : seq;
    return {
      prev: src.prev,
      next: src.next,
      isLoadingPrev: src.isLoadingPrev,
      isLoadingNext: src.isLoadingNext,
      commit: (target) => replaceInputAsset(operationType, inputId, target),
    };
  }, [
    isSetMode,
    assetSetRef,
    asset.id,
    members,
    isLoadingMembers,
    useFolderLocal,
    folderSibs,
    seq,
    replaceInputAsset,
    pinAssetSetMember,
    operationType,
    inputId,
  ]);
}
