/**
 * Assets API Client
 *
 * Typed API client for /api/v1/assets endpoints.
 * Uses OpenAPI-generated types for type safety and contract alignment.
 */
import { createAssetsApi } from '@pixsim7/shared.api.client/domains';
import type {
  AssetResponse,
  FilterMetadataResponse,
  FilterMetadataQueryOptions,
} from '@pixsim7/shared.api.client/domains';
import { getFilenameFromUrl } from '@pixsim7/shared.media.core';

import { fromAssetResponse, getAssetDisplayUrls } from '@features/assets';
// Only import types used in this file; others are re-exported below

import { pixsimClient } from './client';

export type {
  AssetListResponse,
  AssetResponse,
  AssetGenerationContext,
  AssetGroupBy,
  AssetGroupListResponse,
  AssetGroupRequest,
  AssetGroupSummary,
  EnrichAssetResponse,
  ExtractFrameRequest,
  ReuploadAssetRequest,
  AssetSearchRequest,
  FilterDefinition,
  FilterOptionValue,
  FilterMetadataResponse,
  FilterMetadataQueryOptions,
} from '@pixsim7/shared.api.client/domains';

const assetsApi = createAssetsApi(pixsimClient);

// ============================================================================
// API Functions
// ============================================================================

export const listAssets = assetsApi.listAssets;
export const listAssetGroups = assetsApi.listAssetGroups;
export const getAsset = assetsApi.getAsset;
export const deleteAsset = assetsApi.deleteAsset;
export const deleteAssetFromProvider = assetsApi.deleteAssetFromProvider;

/**
 * Archive or unarchive an asset.
 * Archived assets are soft-hidden from the default gallery view.
 */
export const archiveAsset = assetsApi.archiveAsset;

/**
 * Set or clear the user's manual override on the signal-based broken-video heuristic.
 * Stored as media_metadata.signal_metrics.user_override.
 */
export const setSignalOverride = assetsApi.setSignalOverride;

/**
 * Video-health calibration report — grades the current detector against the
 * user's keep/flag labels and suggests a tuned render-ratio cutoff. Mirrors
 * services/asset/signal_calibration.compute_calibration(). Admin-scoped.
 */
export interface SignalCalibrationReport {
  scanner_version: string;
  labels: { broken: number; clean: number; total: number };
  sufficient: boolean;
  min_per_class: number;
  current_model?: {
    tp: number; fp: number; fn: number; tn: number;
    accuracy: number; precision: number; recall: number; f1: number;
  };
  render_ratio?: {
    broken: { n: number; p10: number | null; p50: number | null; p90: number | null };
    clean: { n: number; p10: number | null; p50: number | null; p90: number | null };
    current_weak_cutoff: number;
    suggested_cutoff: { cutoff: number; precision: number; recall: number; f1: number } | null;
  };
  broken_signal_presence?: {
    render_fast: number; audio_quiet: number; visual_static: number;
    no_signal: number; of_total: number;
  };
  recommendation: string;
}

/** Fetch the live video-health calibration report for the current user. */
export function getSignalCalibration(): Promise<SignalCalibrationReport> {
  return pixsimClient.get<SignalCalibrationReport>('/assets/signal-calibration');
}

/**
 * Run the broken-video heuristic scan on a single asset (re-scan on demand).
 */
export const scanSignalMetrics = assetsApi.scanSignalMetrics;

export const bulkDeleteAssets = assetsApi.bulkDeleteAssets;

/**
 * Extract a frame from a video at a specific timestamp.
 * Returns an image asset that can be used for image_to_video or transitions.
 * The extracted frame is linked to the parent video via PAUSED_FRAME lineage.
 */
export const extractFrame = assetsApi.extractFrame;

export const uploadAssetToProvider = assetsApi.uploadAssetToProvider;

/**
 * Enrich an asset by fetching metadata from the provider.
 * Creates a synthetic Generation record with prompt/params.
 */
export const enrichAsset = assetsApi.enrichAsset;

/**
 * Assign or remove tags from an asset.
 * Auto-creates tags if they don't exist.
 */
export const assignTags = assetsApi.assignTags;

/**
 * Get generation context for an asset (from Generation record or media_metadata).
 */
export const getAssetGenerationContext = assetsApi.getAssetGenerationContext;

/**
 * Download an asset to the user's device.
 * Uses the asset's remote_url or falls back to the file endpoint.
 */
/**
 * Get available filter definitions and options for the assets gallery.
 * Returns filter schema + available values for enum types.
 */
export const getFilterMetadata: (
  options?: FilterMetadataQueryOptions
) => Promise<FilterMetadataResponse> =
  assetsApi.getFilterMetadata;

export async function downloadAsset(asset: AssetResponse): Promise<void> {
  const assetModel = fromAssetResponse(asset);
  const { mainUrl, previewUrl, thumbnailUrl } = getAssetDisplayUrls(assetModel);
  const downloadUrl =
    mainUrl || previewUrl || thumbnailUrl || `/api/v1/assets/${asset.id}/file`;

  const link = document.createElement('a');
  link.href = downloadUrl;

  const filename = getFilenameFromUrl(downloadUrl) || `asset_${asset.id}`;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
