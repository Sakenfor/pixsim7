/**
 * Asset Candidate System
 *
 * Unified type system for representing media files from multiple sources:
 * - Folder scans (File System Access API)
 * - Drag & drop / file picker
 * - URL imports
 * - Provider CDN captures
 *
 * All candidates share the same identity model (AssetCore + HashMetadata + UploadTracking)
 * but differ in how they source their bytes.
 */

import type { AssetCore, HashMetadata, UploadTracking } from '@pixsim7/shared.types';

// ============================================================================
// Source-Specific Metadata
// ============================================================================

/**
 * Folder-based candidate metadata.
 * Created from File System Access API folder scans.
 */
export interface FolderSourceMetadata {
  /** Source type discriminator */
  type: 'folder';

  /** Folder ID (generated when folder added, not stable across re-adds) */
  folderId: string;

  /** Path relative to folder root */
  relativePath: string;

  /** File System Access API handle key (references folderHandles store) */
  handleKey?: string;
}

/**
 * File-based candidate metadata.
 * Created from drag & drop or file picker.
 */
export interface FileSourceMetadata {
  /** Source type discriminator */
  type: 'file';

  /** Original file name */
  fileName: string;

  /** How the file was obtained */
  captureMethod: 'drag_drop' | 'file_picker' | 'paste';

  /** Timestamp when file was captured */
  capturedAt: number;
}

/**
 * URL-based candidate metadata.
 * Created from remote URL import.
 */
export interface URLSourceMetadata {
  /** Source type discriminator */
  type: 'url';

  /** Source URL */
  sourceUrl: string;

  /** Optional site/domain info */
  sourceSite?: string;

  /** Timestamp when URL was imported */
  importedAt: number;
}

/**
 * Provider-based candidate metadata.
 * Created from provider CDN URL capture (e.g., browser extension).
 */
export interface ProviderSourceMetadata {
  /** Source type discriminator */
  type: 'provider';

  /** Provider ID (e.g., 'pixverse', 'runway') */
  providerId: string;

  /** Provider's asset ID */
  providerAssetId: string;

  /** CDN URL */
  cdnUrl: string;

  /** Timestamp when captured */
  capturedAt: number;
}

/**
 * Union of all source metadata types.
 * Use discriminated union pattern for type safety.
 */
export type SourceMetadata =
  | FolderSourceMetadata
  | FileSourceMetadata
  | URLSourceMetadata
  | ProviderSourceMetadata;

// ============================================================================
// Asset Candidate Type
// ============================================================================

/**
 * Base interface for all asset candidates.
 * Combines shared asset fields with source-specific metadata.
 */
export interface AssetCandidateBase extends Partial<AssetCore>, HashMetadata, UploadTracking {
  /**
   * Unique identifier for this candidate.
   * - folder: `${folderId}:${relativePath}`
   * - file: `file_${timestamp}_${hash}`
   * - url: `url_${hash(sourceUrl)}`
   * - provider: `${providerId}:${providerAssetId}`
   */
  id: string;

  /**
   * Display name (filename without path).
   */
  name: string;

  /**
   * Media kind (simplified classification).
   */
  kind: 'image' | 'video' | 'audio' | 'other';

  /**
   * File size in bytes.
   */
  size?: number;

  /**
   * Last modified timestamp (Unix milliseconds).
   * For URL/provider candidates, this is the capture time.
   */
  lastModified?: number;

  /**
   * Source metadata (discriminated union).
   */
  source: SourceMetadata;

  /**
   * Transient File object (not persisted to IndexedDB).
   * Available after resolution via resolveCandidateToFile().
   */
  _file?: File;
}

/**
 * Folder-based asset candidate.
 */
export interface FolderCandidate extends AssetCandidateBase {
  source: FolderSourceMetadata;
}

/**
 * File-based asset candidate.
 */
export interface FileCandidate extends AssetCandidateBase {
  source: FileSourceMetadata;
  /** File object (available immediately for file-based candidates) */
  _file: File;
}

/**
 * URL-based asset candidate.
 */
export interface URLCandidate extends AssetCandidateBase {
  source: URLSourceMetadata;
}

/**
 * Provider-based asset candidate.
 */
export interface ProviderCandidate extends AssetCandidateBase {
  source: ProviderSourceMetadata;
}

/**
 * Union of all candidate types.
 * Use source.type to discriminate.
 */
export type AssetCandidate =
  | FolderCandidate
  | FileCandidate
  | URLCandidate
  | ProviderCandidate;

// ============================================================================
// Type Guards
// ============================================================================

export function isFolderCandidate(candidate: AssetCandidate): candidate is FolderCandidate {
  return candidate.source.type === 'folder';
}

export function isFileCandidate(candidate: AssetCandidate): candidate is FileCandidate {
  return candidate.source.type === 'file';
}

export function isURLCandidate(candidate: AssetCandidate): candidate is URLCandidate {
  return candidate.source.type === 'url';
}

export function isProviderCandidate(candidate: AssetCandidate): candidate is ProviderCandidate {
  return candidate.source.type === 'provider';
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Get display name for a candidate.
 */
export function getCandidateDisplayName(candidate: AssetCandidate): string {
  return candidate.name;
}

/**
 * Get stable key for a candidate (for indexing/caching).
 * This key should be stable across app restarts for the same logical file.
 */
export function getCandidateStableKey(candidate: AssetCandidate): string {
  switch (candidate.source.type) {
    case 'folder':
      // Stable within a folder session (but changes if folder re-added)
      return `${candidate.source.folderId}:${candidate.source.relativePath}`;

    case 'file':
      // Use SHA256 if available, otherwise timestamp-based
      return candidate.sha256
        ? `file_sha256_${candidate.sha256}`
        : candidate.id;

    case 'url':
      // Use source URL (stable)
      return `url_${candidate.source.sourceUrl}`;

    case 'provider':
      // Use provider ID + asset ID (stable)
      return `${candidate.source.providerId}:${candidate.source.providerAssetId}`;
  }
}

/**
 * Check if a candidate can be hashed (has accessible bytes).
 */
export function candidateCanHash(candidate: AssetCandidate): boolean {
  switch (candidate.source.type) {
    case 'folder':
      // Can hash if we have handle access
      return !!candidate.source.handleKey;

    case 'file':
      // Can always hash (have File object)
      return true;

    case 'url':
      // Can hash if we fetch the content first
      return true;

    case 'provider':
      // Can hash if we fetch from CDN
      return true;
  }
}

/**
 * Check if a candidate can be uploaded.
 * Some candidates (like provider-based) might already exist on backend.
 */
export function candidateCanUpload(candidate: AssetCandidate): boolean {
  switch (candidate.source.type) {
    case 'folder':
    case 'file':
      // Always uploadable
      return true;

    case 'url':
      // Can use upload-from-url endpoint
      return true;

    case 'provider':
      // Already on provider - might not need upload
      // Check if we want to upload to a different provider
      return false; // Default: already exists
  }
}

/**
 * Get a File object from a candidate.
 * May require async resolution for folder/url/provider candidates.
 */
export async function resolveCandidateToFile(
  candidate: AssetCandidate,
  getFileHandle?: (handleKey: string) => Promise<FileSystemFileHandle | undefined>
): Promise<File | undefined> {
  // If already resolved, return cached file
  if (candidate._file) {
    return candidate._file;
  }

  switch (candidate.source.type) {
    case 'file':
      // File candidates always have File object
      return candidate._file;

    case 'folder':
      // Need to read from FileSystemFileHandle
      if (!candidate.source.handleKey || !getFileHandle) {
        return undefined;
      }

      const handle = await getFileHandle(candidate.source.handleKey);
      if (!handle) {
        return undefined;
      }

      try {
        const file = await handle.getFile();
        // Cache it
        (candidate as any)._file = file;
        return file;
      } catch (e) {
        console.error('Failed to read file from handle:', e);
        return undefined;
      }

    case 'url':
      // Fetch from URL
      try {
        const response = await fetch(candidate.source.sourceUrl);
        const blob = await response.blob();
        const file = new File([blob], candidate.name, {
          type: candidate.mime_type || blob.type,
          lastModified: candidate.lastModified,
        });
        // Cache it
        (candidate as any)._file = file;
        return file;
      } catch (e) {
        console.error('Failed to fetch URL:', e);
        return undefined;
      }

    case 'provider':
      // Fetch from CDN
      try {
        const response = await fetch(candidate.source.cdnUrl);
        const blob = await response.blob();
        const file = new File([blob], candidate.name, {
          type: candidate.mime_type || blob.type,
          lastModified: candidate.lastModified,
        });
        // Cache it
        (candidate as any)._file = file;
        return file;
      } catch (e) {
        console.error('Failed to fetch provider URL:', e);
        return undefined;
      }
  }
}

/**
 * Generate a candidate ID based on source type.
 */
export function generateCandidateId(
  source: SourceMetadata,
  name: string,
  timestamp: number = Date.now()
): string {
  switch (source.type) {
    case 'folder':
      return `${source.folderId}:${source.relativePath}`;

    case 'file':
      // Use timestamp + random for uniqueness
      return `file_${timestamp}_${Math.random().toString(36).slice(2, 11)}`;

    case 'url':
      // Hash the URL for stability
      const urlHash = simpleHash(source.sourceUrl);
      return `url_${urlHash}`;

    case 'provider':
      return `${source.providerId}:${source.providerAssetId}`;
  }
}

/**
 * Simple string hash function (for generating IDs).
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Backward Compatibility
// ============================================================================

/**
 * Legacy LocalAsset type (for backward compatibility).
 * @deprecated Use AssetCandidate with source.type === 'folder' instead.
 */
export type LocalAsset = FolderCandidate & {
  /** Legacy field mapping */
  key: string; // Maps to id
  fileHandle?: FileSystemFileHandle; // Transient, not persisted
};

/**
 * Convert legacy LocalAsset to AssetCandidate.
 */
export function legacyLocalAssetToCandidate(legacy: any): FolderCandidate {
  return {
    id: legacy.key,
    name: legacy.name,
    kind: legacy.kind,
    size: legacy.size,
    lastModified: legacy.lastModified,
    source: {
      type: 'folder',
      folderId: legacy.folderId,
      relativePath: legacy.relativePath,
      handleKey: legacy.key, // Use key as handle reference
    },
    // Copy shared fields
    sha256: legacy.sha256,
    sha256_computed_at: legacy.sha256_computed_at,
    sha256_file_size: legacy.sha256_file_size,
    sha256_last_modified: legacy.sha256_last_modified,
    last_upload_status: legacy.lastUploadStatus,
    last_upload_note: legacy.lastUploadNote,
    last_upload_at: legacy.lastUploadAt,
    last_upload_provider_id: legacy.last_upload_provider_id,
    last_upload_asset_id: legacy.last_upload_asset_id,
  };
}

/**
 * Convert AssetCandidate to legacy LocalAsset format.
 */
export function candidateToLegacyLocalAsset(candidate: FolderCandidate): any {
  return {
    key: candidate.id,
    name: candidate.name,
    relativePath: candidate.source.relativePath,
    kind: candidate.kind,
    size: candidate.size,
    lastModified: candidate.lastModified,
    folderId: candidate.source.folderId,
    // Shared fields
    sha256: candidate.sha256,
    sha256_computed_at: candidate.sha256_computed_at,
    sha256_file_size: candidate.sha256_file_size,
    sha256_last_modified: candidate.sha256_last_modified,
    lastUploadStatus: candidate.last_upload_status,
    lastUploadNote: candidate.last_upload_note,
    lastUploadAt: candidate.last_upload_at,
  };
}
