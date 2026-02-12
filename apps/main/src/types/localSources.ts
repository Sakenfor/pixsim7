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

import type { LocalAsset } from '@features/assets/stores/localFoldersStore';

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

export interface LocalFoldersController extends FolderSourceController<LocalAsset> {
  // Override source to use the legacy SourceInfo type for backward compatibility
  // The controller also provides the new SourceIdentity-compatible structure
  source: SourceIdentity & SourceInfo;

  // Local-specific: load persisted folders on mount
  loadPersisted: () => void;

  // Background SHA hashing progress (null when idle)
  hashingProgress: { total: number; done: number } | null;
  hashingPaused: boolean;
  pauseHashing: () => void;
  resumeHashing: () => void;
  cancelHashing: () => void;

  // Missing folders (exist in backend but IndexedDB was cleared)
  /** Combined list of real folders + missing folder placeholders */
  foldersWithMissing: FolderWithMissing[];
  /** Names of folders that are missing locally but exist in backend */
  missingFolderNames: string[];
  /** Trigger folder picker to restore a missing folder */
  restoreMissingFolder: (folderName: string) => Promise<void>;
  /** Dismiss the missing folders warning */
  dismissMissingFolders: () => void;
}
