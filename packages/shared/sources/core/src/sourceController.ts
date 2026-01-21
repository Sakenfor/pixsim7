/**
 * SourceController Type System
 *
 * Generic abstractions for asset source controllers (Local Folders, Google Drive, etc.)
 * with proper type safety and composable capabilities.
 */

// ============================================================================
// Core Identity & State Interfaces
// ============================================================================

/**
 * Uniquely identifies a source instance
 */
export interface SourceIdentity {
  /** Source type ID (e.g., 'local-fs', 'google-drive') */
  typeId: string;
  /** Instance ID (unique per type, allows multiple instances like "Work Drive", "Personal Drive") */
  instanceId: string;
  /** Human-readable display name */
  label: string;
  /** Category for grouping ('local' | 'remote' | 'cloud' | 'social') */
  kind: 'local' | 'remote' | 'cloud' | 'social';
  /** Icon identifier for UI */
  icon: string;
}

/**
 * Loading and error state for a source
 */
export interface SourceLoadingState {
  /** Initial data loading in progress */
  loading: boolean;
  /** Any operation in progress (loading, scanning, refreshing, etc.) */
  busy: boolean;
  /** Current error message, if any */
  error: string | null;
}

// ============================================================================
// Capability Interfaces (Mixins)
// ============================================================================

/**
 * Preview management capability
 */
export interface PreviewCapability<TAsset> {
  /** Cached preview URLs keyed by asset identifier */
  previews: Record<string, string>;
  /** Load preview for an asset (caches result) */
  loadPreview: (asset: TAsset | string) => Promise<void>;
  /** Revoke/cleanup a preview URL when no longer needed */
  revokePreview: (assetKey: string) => void;
}

/**
 * Viewer/lightbox navigation capability
 */
export interface ViewerCapability<TAsset> {
  /** Currently viewed asset (null if viewer closed) */
  viewerAsset: TAsset | null;
  /** Open viewer for a specific asset */
  openViewer: (asset: TAsset) => void;
  /** Close the viewer */
  closeViewer: () => void;
  /** Navigate to previous/next asset in the list */
  navigateViewer: (direction: 'prev' | 'next') => void;
}

/**
 * Upload capability for importing assets to the system
 */
export interface UploadCapability<TAsset> {
  /** Selected provider/destination for uploads */
  providerId: string | undefined;
  /** Set the upload provider */
  setProviderId: (id: string | undefined) => void;
  /** Upload status per asset key */
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  /** Upload notes/messages per asset key */
  uploadNotes: Record<string, string | undefined>;
  /** Upload a single asset to the selected provider */
  uploadOne: (asset: TAsset | string) => Promise<void>;
}

/**
 * Folder management capability (for sources with folder structure)
 */
export interface FolderCapability {
  /** List of registered folders */
  folders: Array<{ id: string; name: string }>;
  /** Add a new folder (opens picker) */
  addFolder: () => void;
  /** Remove a folder by ID */
  removeFolder: (id: string) => void;
  /** Refresh/rescan a specific folder */
  refreshFolder: (id: string) => void;
  /** Currently selected folder path (for tree view) */
  selectedFolderPath: string | null;
  /** Set the selected folder path */
  setSelectedFolderPath: (path: string | null) => void;
}

/**
 * View mode capability (grid, list, tree views)
 */
export interface ViewModeCapability {
  /** Current view mode */
  viewMode: 'grid' | 'list' | 'tree';
  /** Set view mode */
  setViewMode: (mode: 'grid' | 'list' | 'tree') => void;
}

/**
 * Authentication capability (for cloud sources)
 */
export interface AuthCapability {
  /** Whether the user is authenticated with this source */
  isAuthenticated: boolean;
  /** User info from the auth provider */
  userInfo: { name?: string; email?: string; avatar?: string } | null;
  /** Trigger authentication flow */
  authenticate: () => Promise<void>;
  /** Sign out from this source */
  signOut: () => Promise<void>;
}

/**
 * Feature flags/support capability
 */
export interface FeatureFlagsCapability {
  /** Whether the source is supported in current environment */
  supported: boolean;
  /** Reason if not supported */
  notSupportedReason?: string;
}

/**
 * Scanning/progress capability (for sources that scan folders)
 */
export interface ScanningCapability {
  /** Whether a folder is being added */
  adding: boolean;
  /** Current scan progress, if any */
  scanning: {
    folderId: string;
    scanned: number;
    found: number;
    currentPath: string;
  } | null;
}

// ============================================================================
// Base Controller Interface
// ============================================================================

/**
 * Base controller interface that all source controllers must implement
 */
export interface BaseSourceController<TAsset> {
  /** Source identity information */
  source: SourceIdentity;

  /** All assets from this source */
  assets: TAsset[];

  /** Filtered assets (based on current view/selection) */
  filteredAssets: TAsset[];

  /** Get unique key for an asset */
  getAssetKey: (asset: TAsset) => string;

  /** Refresh all data from source */
  refresh: () => Promise<void>;
}

// ============================================================================
// Composite Controller Types
// ============================================================================

/**
 * Controller for folder-based sources (Local Folders)
 * Has folders, scanning, view modes, previews, viewer, and uploads
 */
export type FolderSourceController<TAsset> =
  BaseSourceController<TAsset> &
  SourceLoadingState &
  PreviewCapability<TAsset> &
  ViewerCapability<TAsset> &
  UploadCapability<TAsset> &
  FolderCapability &
  ViewModeCapability &
  FeatureFlagsCapability &
  ScanningCapability;

/**
 * Controller for cloud sources (Google Drive, Dropbox)
 * Has auth, folders, view modes, previews, viewer, and uploads
 */
export type CloudSourceController<TAsset> =
  BaseSourceController<TAsset> &
  SourceLoadingState &
  PreviewCapability<TAsset> &
  ViewerCapability<TAsset> &
  UploadCapability<TAsset> &
  FolderCapability &
  ViewModeCapability &
  AuthCapability;

/**
 * Controller for import-only sources (Pinterest, URL import)
 * Minimal: just auth and upload capability
 */
export type ImportSourceController<TAsset> =
  BaseSourceController<TAsset> &
  SourceLoadingState &
  UploadCapability<TAsset> &
  AuthCapability;

/**
 * Union type for any source controller
 */
export type AnySourceController<TAsset = unknown> =
  | FolderSourceController<TAsset>
  | CloudSourceController<TAsset>
  | ImportSourceController<TAsset>
  | BaseSourceController<TAsset>;

/**
 * Controller type discriminator
 */
export type SourceControllerType = 'folder' | 'cloud' | 'import' | 'base';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if controller has folder capability
 */
export function hasFolderCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & FolderCapability {
  return 'folders' in controller && 'addFolder' in controller;
}

/**
 * Check if controller has auth capability
 */
export function hasAuthCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & AuthCapability {
  return 'isAuthenticated' in controller && 'authenticate' in controller;
}

/**
 * Check if controller has upload capability
 */
export function hasUploadCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & UploadCapability<TAsset> {
  return 'uploadOne' in controller && 'uploadStatus' in controller;
}

/**
 * Check if controller has preview capability
 */
export function hasPreviewCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & PreviewCapability<TAsset> {
  return 'previews' in controller && 'loadPreview' in controller;
}

/**
 * Check if controller has viewer capability
 */
export function hasViewerCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & ViewerCapability<TAsset> {
  return 'viewerAsset' in controller && 'openViewer' in controller;
}

/**
 * Check if controller has view mode capability
 */
export function hasViewModeCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & ViewModeCapability {
  return 'viewMode' in controller && 'setViewMode' in controller;
}

/**
 * Check if controller has scanning capability
 */
export function hasScanningCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & ScanningCapability {
  return 'scanning' in controller && 'adding' in controller;
}

/**
 * Check if controller has feature flags capability
 */
export function hasFeatureFlagsCapability<TAsset>(
  controller: AnySourceController<TAsset>
): controller is AnySourceController<TAsset> & FeatureFlagsCapability {
  return 'supported' in controller;
}

/**
 * Check if controller is a FolderSourceController
 */
export function isFolderController<TAsset>(
  controller: AnySourceController<TAsset>
): controller is FolderSourceController<TAsset> {
  return (
    hasFolderCapability(controller) &&
    hasScanningCapability(controller) &&
    hasFeatureFlagsCapability(controller)
  );
}

/**
 * Check if controller is a CloudSourceController
 */
export function isCloudController<TAsset>(
  controller: AnySourceController<TAsset>
): controller is CloudSourceController<TAsset> {
  return (
    hasFolderCapability(controller) &&
    hasAuthCapability(controller) &&
    !hasScanningCapability(controller)
  );
}

/**
 * Check if controller is an ImportSourceController
 */
export function isImportController<TAsset>(
  controller: AnySourceController<TAsset>
): controller is ImportSourceController<TAsset> {
  return (
    hasAuthCapability(controller) &&
    hasUploadCapability(controller) &&
    !hasFolderCapability(controller)
  );
}
