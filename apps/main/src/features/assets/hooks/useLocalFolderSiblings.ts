/**
 * useLocalFolderSiblings
 *
 * Folder-aware prev/next lookup for `LocalAssetModel` pivots — counterpart
 * to `useAssetSequence` for backend-tracked assets. Reads the
 * `useLocalFolders` zustand store synchronously, filters to assets in the
 * same folder + same directory as the pivot (no nested-folder bleed),
 * sorts by relativePath (alphabetical), and returns the immediate
 * neighbors.
 *
 * Used by `useInputSlotNavigation` for the `source` cohort when the pivot
 * is a local-folder asset (generated assets keep using `useAssetSequence`
 * with the `promptVersionId` filter).
 *
 * Plan: `media-card-input-time-nav` (source-cohort).
 */

import { useMemo } from 'react';

import type { AssetModel } from '../models/asset';
import { useLocalFolders } from '../stores/localFoldersStore';
import { isLocalAssetModel, type LocalAssetModel } from '../types/localFolderMeta';

export interface UseLocalFolderSiblingsArgs {
  /** Pivot asset. Null/non-local → returns no neighbors (hook is inert). */
  pivot: AssetModel | null;
  /** Set false to suspend lookup; defaults to true. */
  enabled?: boolean;
}

export interface UseLocalFolderSiblingsReturn {
  prev: AssetModel | null;
  next: AssetModel | null;
  /** Local lookup is synchronous; loading flags are always false. */
  isLoadingPrev: boolean;
  isLoadingNext: boolean;
}

function dirOf(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  return idx === -1 ? '' : relativePath.slice(0, idx);
}

/**
 * Resolve a backend AssetModel to the LocalAssetModel it was uploaded from,
 * if any — by matching `LocalAssetModel.last_upload_asset_id` to the backend
 * id. Lets folder walking work for assets that look like plain backend
 * assets but originated from a tracked local folder.
 */
function findLocalOrigin(
  pivot: AssetModel,
  assetsRecord: Record<string, LocalAssetModel>,
): LocalAssetModel | null {
  if (isLocalAssetModel(pivot)) return pivot;
  const pivotId = pivot.id;
  for (const a of Object.values(assetsRecord)) {
    if (a.last_upload_asset_id === pivotId) return a;
  }
  return null;
}

/**
 * Reactive selector — true when `asset` is recognized as folder-sourced.
 * Signals (any one):
 *   - Directly a `LocalAssetModel` (unuploaded file in the LocalFolders pane).
 *   - `uploadMethod === 'local'` (uploaded via the local-folder pipeline).
 *   - `upload_context.source_folder_id` is set (canonical folder identity
 *     written by the upload pipeline).
 *   - `last_upload_asset_id` link in the in-memory `useLocalFolders` store.
 *
 * `asset.localPath` is intentionally NOT a signal — that's the BACKEND
 * storage location, set on every locally-stored asset, not just folder-
 * uploaded ones.
 */
export function useHasLocalFolderOrigin(asset: AssetModel | null | undefined): boolean {
  const assetsRecord = useLocalFolders((s) => s.assets);
  return useMemo(() => {
    if (!asset) return false;
    if (asset.uploadMethod === 'local') return true;
    const ctx = asset.uploadContext as Record<string, unknown> | null | undefined;
    if (ctx && typeof ctx.source_folder_id === 'string' && ctx.source_folder_id) return true;
    return !!findLocalOrigin(asset, assetsRecord);
  }, [asset, assetsRecord]);
}

export function useLocalFolderSiblings({
  pivot,
  enabled = true,
}: UseLocalFolderSiblingsArgs): UseLocalFolderSiblingsReturn {
  const assetsRecord = useLocalFolders((s) => s.assets);

  return useMemo<UseLocalFolderSiblingsReturn>(() => {
    if (!enabled || !pivot) {
      return { prev: null, next: null, isLoadingPrev: false, isLoadingNext: false };
    }
    const localPivot = findLocalOrigin(pivot, assetsRecord);
    if (!localPivot) {
      return { prev: null, next: null, isLoadingPrev: false, isLoadingNext: false };
    }
    const pivotDir = dirOf(localPivot.relativePath);

    const inDir = Object.values(assetsRecord).filter(
      (a) => a.folderId === localPivot.folderId && dirOf(a.relativePath) === pivotDir,
    );
    inDir.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const idx = inDir.findIndex((a) => a._localKey === localPivot._localKey);
    if (idx === -1) {
      return { prev: null, next: null, isLoadingPrev: false, isLoadingNext: false };
    }
    return {
      prev: idx > 0 ? inDir[idx - 1] : null,
      next: idx < inDir.length - 1 ? inDir[idx + 1] : null,
      isLoadingPrev: false,
      isLoadingNext: false,
    };
  }, [pivot, assetsRecord, enabled]);
}
