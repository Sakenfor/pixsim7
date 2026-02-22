/**
 * Upload Actions — shared post-processing helpers for upload call sites.
 *
 * Pure functions (no React). Centralizes error extraction, provider label
 * resolution, and gallery notification so every upload surface behaves
 * consistently.
 */

import { getAsset } from './api';
import { assetEvents } from './assetEvents';
import { getUploadCapableProviders } from './resolveUploadTarget';

// ── Error extraction ────────────────────────────────────────────────────

/**
 * Extract a human-readable error message from an unknown thrown value.
 *
 * Handles Axios-style `err.response.data.detail`, standard Error objects,
 * and arbitrary values.  A `fallback` string is used when nothing useful
 * can be derived.
 */
export function extractUploadError(err: unknown, fallback = 'Upload failed'): string {
  if (err && typeof err === 'object') {
    // Axios-style: err.response.data.detail
    const axiosDetail = (err as any)?.response?.data?.detail;
    if (typeof axiosDetail === 'string' && axiosDetail) return axiosDetail;

    if (err instanceof Error && err.message) return err.message;
  }

  if (typeof err === 'string' && err) return err;

  return fallback;
}

// ── Provider label resolution ───────────────────────────────────────────

/**
 * Resolve a human-readable label for a provider ID by looking it up in the
 * capability registry.  Falls back to the raw `providerId` when unrecognised.
 */
export function resolveProviderLabel(providerId: string): string {
  const match = getUploadCapableProviders().find((p) => p.providerId === providerId);
  return match?.name ?? providerId;
}

// ── Gallery notifications ───────────────────────────────────────────────

/**
 * Fetch a newly-created asset and emit `assetCreated` so gallery surfaces
 * pick it up without a full refresh.
 */
export async function notifyGalleryOfNewAsset(assetId: number): Promise<void> {
  const asset = await getAsset(assetId);
  assetEvents.emitAssetCreated(asset);
}

/**
 * Fetch an updated asset and emit `assetUpdated` so gallery surfaces
 * refresh the card without a full refresh.
 */
export async function notifyGalleryOfUpdatedAsset(assetId: number): Promise<void> {
  const asset = await getAsset(assetId);
  assetEvents.emitAssetUpdated(asset);
}
