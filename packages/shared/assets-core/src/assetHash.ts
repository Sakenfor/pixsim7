/**
 * Asset hash utilities.
 *
 * Runtime helpers for SHA256 validation and cache freshness checks.
 */
import type { AssetIdentity, HashMetadata } from '@pixsim7/shared.types';

/**
 * Type guard to check if an object has a valid SHA256 hash.
 */
export function hasValidSHA256(
  obj: Partial<AssetIdentity>
): obj is AssetIdentity & { sha256: string } {
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
