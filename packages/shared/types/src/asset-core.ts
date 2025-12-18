/**
 * Shared Asset Type Definitions
 *
 * Core interfaces shared between:
 * - Backend Asset model (Python/SQLModel)
 * - Frontend LocalAsset (TypeScript)
 * - API responses (OpenAPI generated)
 *
 * These define the "identity" and "metadata" fields that exist across
 * all representations of a media asset, whether it's in the database,
 * in a local folder, or in transit via API.
 */

/**
 * Core asset identity and file metadata.
 *
 * These fields are intrinsic to the file itself and should be
 * consistent regardless of where the asset is stored or how it's tracked.
 */
export interface AssetIdentity {
  /**
   * SHA256 hash of file content (hex-encoded, 64 chars).
   * Used for deduplication and integrity verification.
   */
  sha256?: string;

  /**
   * Media type classification.
   */
  media_type: 'video' | 'image' | 'audio' | '3d_model';

  /**
   * MIME type (e.g., 'video/mp4', 'image/jpeg').
   */
  mime_type?: string;

  /**
   * File size in bytes.
   */
  file_size_bytes?: number;
}

/**
 * Visual/audio metadata extracted from the file.
 *
 * These are computed properties that don't change based on
 * where the file is stored.
 */
export interface AssetMetadata {
  /**
   * Width in pixels (for images/videos).
   */
  width?: number;

  /**
   * Height in pixels (for images/videos).
   */
  height?: number;

  /**
   * Duration in seconds (for videos/audio).
   */
  duration_sec?: number;

  /**
   * Frames per second (for videos).
   */
  fps?: number;

  /**
   * User-provided or AI-generated description.
   */
  description?: string;
}

/**
 * URLs for accessing the asset's content.
 *
 * Assets can exist in multiple locations simultaneously:
 * - Remote provider URL (original upload location)
 * - Local cache path (downloaded copy)
 * - Thumbnail URL (small preview)
 * - Preview URL (higher quality preview)
 */
export interface AssetLocations {
  /**
   * Remote URL from original provider (e.g., Pixverse CDN).
   */
  remote_url?: string;

  /**
   * Local file system path (if downloaded).
   * Backend: Absolute path on server
   * Frontend: Not used (uses FileHandle instead)
   */
  local_path?: string;

  /**
   * Thumbnail URL (small, fast-loading preview).
   */
  thumbnail_url?: string;

  /**
   * Preview URL (higher quality preview, larger file).
   */
  preview_url?: string;
}

/**
 * Complete core asset interface combining identity, metadata, and locations.
 *
 * Both backend Asset and frontend LocalAsset should implement/extend this.
 */
export interface AssetCore extends AssetIdentity, AssetMetadata, AssetLocations {
  // Marker interface - all fields from parent interfaces
}

/**
 * Hash computation metadata for tracking when hashes were computed
 * and validating cache freshness.
 */
export interface HashMetadata {
  /**
   * SHA256 hash of file content.
   */
  sha256?: string;

  /**
   * Timestamp when SHA256 was computed (Unix milliseconds).
   * Used for cache invalidation.
   */
  sha256_computed_at?: number;

  /**
   * File size when hash was computed.
   * If current size differs, hash must be recomputed.
   */
  sha256_file_size?: number;

  /**
   * File last modified timestamp when hash was computed.
   * If current lastModified differs, hash must be recomputed.
   */
  sha256_last_modified?: number;
}

/**
 * Upload tracking fields for local assets that haven't been uploaded yet.
 */
export interface UploadTracking {
  /**
   * Upload status to provider.
   */
  last_upload_status?: 'idle' | 'uploading' | 'success' | 'error';

  /**
   * Note from last upload attempt (e.g., "Reused existing asset").
   */
  last_upload_note?: string;

  /**
   * Timestamp of last upload attempt (Unix milliseconds).
   */
  last_upload_at?: number;

  /**
   * Provider ID this was uploaded to.
   */
  last_upload_provider_id?: string;

  /**
   * Backend asset ID (if upload succeeded).
   */
  last_upload_asset_id?: number;
}

/**
 * Type guard to check if an object has a valid SHA256 hash.
 */
export function hasValidSHA256(obj: Partial<AssetIdentity>): obj is AssetIdentity & { sha256: string } {
  return typeof obj.sha256 === 'string' && obj.sha256.length === 64;
}

/**
 * Type guard to check if hash metadata is fresh.
 *
 * Hash is considered fresh if:
 * - SHA256 exists
 * - File size matches
 * - Last modified timestamp matches
 */
export function isHashFresh(
  metadata: Partial<HashMetadata>,
  currentSize: number,
  currentLastModified: number
): metadata is HashMetadata & { sha256: string } {
  return (
    typeof metadata.sha256 === 'string' &&
    metadata.sha256.length === 64 &&
    metadata.sha256_file_size === currentSize &&
    metadata.sha256_last_modified === currentLastModified
  );
}
