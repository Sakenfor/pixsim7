/**
 * Local Folder Metadata Types
 *
 * Sidecar metadata for local folder assets that doesn't belong on AssetModel.
 * Includes hash tracking, upload tracking, file handles, and folder source info.
 *
 * The store holds AssetModel (via LocalAssetModel) for rendering and
 * LocalFolderMeta for local-only operations (hashing, uploading, file access).
 */

import type { AssetModel } from '../models/asset';

// ── LocalAssetModel ─────────────────────────────────────────────────
// Extends AssetModel with local-folder identity fields.
// Assignable to AssetModel anywhere — gallery, generation, viewer all
// accept it without changes.

export interface LocalAssetModel extends AssetModel {
  /** Local folder key (folderId:relativePath) — used for meta/preview/upload lookups */
  _localKey: string;
  /** Folder ID this asset belongs to */
  _folderId: string;

  // ── Convenience fields mirrored from LocalFolderMeta ────────────
  // These let consumer code access common local fields directly
  // without a sidecar lookup. Updated whenever meta changes.

  /** @alias _localKey — matches legacy LocalAsset.key for easy migration */
  key: string;
  /** @alias _folderId — matches legacy LocalAsset.folderId */
  folderId: string;
  /** Path within the folder (matches legacy LocalAsset.relativePath) */
  relativePath: string;
  /** File kind */
  kind: 'image' | 'video' | 'audio' | 'other';
  /** Raw file size in bytes */
  size?: number;
  /** Last modified timestamp (Unix ms) */
  lastModified?: number;

  // Hash tracking
  sha256_computed_at?: number;
  sha256_file_size?: number;
  sha256_last_modified?: number;

  // Upload tracking
  last_upload_status?: 'idle' | 'uploading' | 'success' | 'error';
  last_upload_note?: string;
  last_upload_at?: number;
  last_upload_provider_id?: string;
  last_upload_asset_id?: number;
}

// ── LocalFolderMeta ─────────────────────────────────────────────────
// Non-renderable sidecar for hash tracking, upload state, and file access.
// Keyed by the same `_localKey` string as LocalAssetModel.

export interface LocalFolderMeta {
  /** Stable local key (folderId:relativePath) */
  key: string;
  /** Which folder this belongs to */
  folderId: string;
  /** Path within the folder */
  relativePath: string;
  /** Display name (filename) */
  name: string;
  /** File kind */
  kind: 'image' | 'video' | 'audio' | 'other';
  /** File size in bytes */
  size?: number;
  /** Last modified timestamp (Unix ms) */
  lastModified?: number;
  /** Transient file handle (not persisted to IndexedDB) */
  fileHandle?: FileSystemFileHandle;

  // Hash tracking
  sha256?: string;
  sha256_computed_at?: number;
  sha256_file_size?: number;
  sha256_last_modified?: number;

  // Upload tracking
  last_upload_status?: 'idle' | 'uploading' | 'success' | 'error';
  last_upload_note?: string;
  last_upload_at?: number;
  last_upload_provider_id?: string;
  last_upload_asset_id?: number;
}

// ── Conversion ──────────────────────────────────────────────────────

/**
 * Deterministic negative ID for unuploaded local files.
 * Stable across renders for the same asset key.
 */
export function hashStringToStableNegativeId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) || 1;
  return -normalized;
}

/**
 * Build a LocalAssetModel from sidecar metadata.
 *
 * This is the single conversion point: raw local metadata → canonical
 * AssetModel shape that the rest of the app consumes.
 */
export function buildLocalAssetModel(
  meta: LocalFolderMeta,
  options: { previewUrl?: string; defaultProviderId?: string } = {},
): LocalAssetModel {
  const { previewUrl, defaultProviderId } = options;

  const uploadedAssetId =
    typeof meta.last_upload_asset_id === 'number' && meta.last_upload_asset_id > 0
      ? meta.last_upload_asset_id
      : undefined;

  const id = uploadedAssetId ?? hashStringToStableNegativeId(meta.key);
  const isUploaded = !!uploadedAssetId;

  const mediaType = meta.kind === 'video' ? 'video' : 'image';
  const providerId = isUploaded
    ? (meta.last_upload_provider_id || defaultProviderId || 'library')
    : 'local';
  const providerStatus = isUploaded ? 'ok' : 'local_only';

  // For uploaded assets, use backend file endpoint for generation-facing URLs.
  // blob: URLs only work in the browser — the backend can't resolve them.
  const backendFileUrl = uploadedAssetId ? `/api/v1/assets/${uploadedAssetId}/file` : null;

  return {
    // AssetModel fields
    id,
    createdAt: new Date(meta.lastModified || Date.now()).toISOString(),
    description: meta.name,
    durationSec: null,
    fileSizeBytes: meta.size ?? null,
    fileUrl: backendFileUrl ?? previewUrl ?? null,
    height: null,
    isArchived: false,
    localPath: meta.relativePath,
    mediaType,
    previewUrl: previewUrl ?? null,
    providerAssetId: isUploaded ? String(uploadedAssetId) : meta.key,
    providerId,
    providerStatus,
    remoteUrl: backendFileUrl ?? previewUrl ?? null,
    syncStatus: 'downloaded',
    thumbnailUrl: previewUrl ?? null,
    userId: 0,
    width: null,
    sha256: meta.sha256 ?? null,

    // LocalAssetModel identity
    _localKey: meta.key,
    _folderId: meta.folderId,

    // Convenience fields mirrored from meta
    key: meta.key,
    folderId: meta.folderId,
    relativePath: meta.relativePath,
    kind: meta.kind,
    size: meta.size,
    lastModified: meta.lastModified,

    // Hash tracking
    sha256_computed_at: meta.sha256_computed_at,
    sha256_file_size: meta.sha256_file_size,
    sha256_last_modified: meta.sha256_last_modified,

    // Upload tracking
    last_upload_status: meta.last_upload_status,
    last_upload_note: meta.last_upload_note,
    last_upload_at: meta.last_upload_at,
    last_upload_provider_id: meta.last_upload_provider_id,
    last_upload_asset_id: meta.last_upload_asset_id,
  };
}

/**
 * Type guard: check if an AssetModel is a LocalAssetModel.
 */
export function isLocalAssetModel(asset: AssetModel): asset is LocalAssetModel {
  return '_localKey' in asset && typeof (asset as LocalAssetModel)._localKey === 'string';
}
