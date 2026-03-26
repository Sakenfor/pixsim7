/**
 * Type definitions for Local Sources & Folders Controller
 *
 * Defines a minimal "source" model and controller API that works for local folders now,
 * and can support other sources (e.g., Google Drive, cloud storage) later.
 *
 * LocalFoldersController extends FolderSourceController for generic source abstraction
 * while maintaining backward compatibility with existing code.
 */

import type { FolderSourceController, SourceIdentity } from '@pixsim7/shared.sources.core';

import type { UploadAssetResponse } from '@lib/api/upload';

import type { LocalAssetModel, LocalFolderMeta } from '@features/assets';

export type LocalSourceId = 'local-fs';

/**
 * @deprecated Use SourceIdentity from sourceController.ts instead
 * Kept for backward compatibility
 */
export interface SourceInfo {
  id: LocalSourceId;        // currently only 'local-fs'
  label: string;            // "Local Folders"
  type: 'local';            // reserved for future: 'cloud', 'drive', etc.
}

export type ViewMode = 'grid' | 'tree' | 'list';

/**
 * LocalFoldersController extends FolderSourceController with local-specific additions.
 *
 * Implements all capabilities from FolderSourceController:
 * - BaseSourceController: source, assets, filteredAssets, getAssetKey, refresh
 * - SourceLoadingState: loading, busy, error
 * - PreviewCapability: previews, loadPreview, revokePreview
 * - ViewerCapability: viewerAsset, openViewer, closeViewer, navigateViewer
 * - UploadCapability: providerId, setProviderId, uploadStatus, uploadNotes, uploadOne
 * - Local extensions: favoriteStatus, toggleFavoriteOne
 * - FolderCapability: folders, addFolder, removeFolder, refreshFolder, selectedFolderPath, setSelectedFolderPath
 * - ViewModeCapability: viewMode, setViewMode
 * - FeatureFlagsCapability: supported
 * - ScanningCapability: adding, scanning
 */
/** Folder entry with optional missing state */
export type FolderWithMissing = {
  id: string;
  name: string;
  isMissing: boolean;
};

export interface LocalFoldersController extends FolderSourceController<LocalAssetModel> {
  // Override source to use the legacy SourceInfo type for backward compatibility
  source: SourceIdentity & SourceInfo;

  /** Access local-only sidecar metadata (hash tracking, upload tracking, file handles) */
  getLocalMeta: (key: string) => LocalFolderMeta | undefined;
  /** Cancel queued preview loads (call on page/view change to prevent stale I/O) */
  cancelPendingPreviews?: () => void;

  // Local-specific: load persisted folders on mount
  loadPersisted: () => void;

  // Background SHA hashing progress (null when idle)
  hashingProgress: {
    total: number;
    done: number;
    bytesDone?: number;
    bytesTotal?: number;
    phase?: 'reading' | 'digesting';
    activeAssetName?: string;
  } | null;
  hashingPaused: boolean;
  pauseHashing: () => void;
  resumeHashing: () => void;
  cancelHashing: () => void;
  /** Manually trigger hashing for a specific folder path (works even when auto-hash is off) */
  hashFolder: (path: string) => void;
  /** Hash only the given asset keys (for scoped actions like drilled group views) */
  hashAssets: (keys: string[]) => void;
  /** Re-check all hashed assets against backend (clears check cache, re-queries) */
  recheckBackend: () => void;

  // Missing folders (exist in backend but IndexedDB was cleared)
  foldersWithMissing: FolderWithMissing[];
  missingFolderNames: string[];
  restoreMissingFolder: (folderName: string) => Promise<void>;
  dismissMissingFolders: () => void;

  /** Upload one asset to a specific provider */
  uploadOneToProvider: (asset: LocalAssetModel | string, providerId: string) => Promise<UploadAssetResponse | null>;
  /** Upload one asset explicitly to library */
  uploadOneToLibrary: (asset: LocalAssetModel | string) => Promise<void>;

  // Local favorites
  favoriteStatus: Record<string, boolean>;
  toggleFavoriteOne: (asset: LocalAssetModel | string) => Promise<void>;
}
