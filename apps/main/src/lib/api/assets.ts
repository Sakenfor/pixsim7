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

/**
 * Fetch many assets by id in one round-trip (POST /assets/bulk/get).
 *
 * Same semantics as getAsset (ownership-scoped, unfiltered) — used to collapse
 * the per-asset refresh GET storm during a generation burst into a single
 * request. Missing/forbidden ids are simply absent from the result, so callers
 * must reconcile by id (and can fall back to getAsset for any they expected).
 */
export async function getAssetsByIds(ids: number[]): Promise<AssetResponse[]> {
  if (ids.length === 0) return [];
  return pixsimClient.post<AssetResponse[]>('/assets/bulk/get', { asset_ids: ids });
}
export const deleteAsset = assetsApi.deleteAsset;
export const deleteAssetFromProvider = assetsApi.deleteAssetFromProvider;

/**
 * Fetch the cohort/sibling counts for a single asset's similarity badge.
 *
 * These used to ride on every asset response, but computing them ran ~7 GROUP
 * BY queries per asset on the hot path. They're now loaded lazily (on hover)
 * from this dedicated endpoint. Returns a map keyed by lit-facet letters in
 * canonical i<p<s order (i, p, s, ip, is, ps, ips); `{}` when no facet applies.
 */
export function getAssetCohortCounts(
  assetId: number,
  brokenScoreCutoff?: number,
): Promise<Record<string, number>> {
  // When set, the backend also drops high-confidence heuristic-broken siblings
  // (the similarity badge's "hide broken" setting) so the count matches the
  // mini-gallery the badge opens. Omitted → only manual flags are excluded.
  const qs =
    typeof brokenScoreCutoff === 'number'
      ? `?broken_score_cutoff=${brokenScoreCutoff}`
      : '';
  return pixsimClient.get<Record<string, number>>(`/assets/${assetId}/cohort-counts${qs}`);
}

/**
 * Batch variant: fetch cohort counts for many assets in one round-trip
 * (POST /assets/cohort-counts). Returns `{asset_id: {combo: count}}`; missing/
 * forbidden ids are simply absent. For optional gallery-page prefetch.
 */
export async function getCohortCountsByIds(
  ids: number[],
  brokenScoreCutoff?: number,
): Promise<Record<number, Record<string, number>>> {
  if (ids.length === 0) return {};
  return pixsimClient.post<Record<number, Record<string, number>>>(
    '/assets/cohort-counts',
    {
      asset_ids: ids,
      ...(typeof brokenScoreCutoff === 'number'
        ? { broken_score_cutoff: brokenScoreCutoff }
        : {}),
    },
  );
}

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

/**
 * Fetch the live video-health calibration report for the current user.
 * `cacheBust` (e.g. a label-change counter) defeats any HTTP-layer caching so a
 * refetch right after labelling reflects the new label immediately.
 */
export function getSignalCalibration(cacheBust?: number): Promise<SignalCalibrationReport> {
  return pixsimClient.get<SignalCalibrationReport>(
    '/assets/signal-calibration',
    cacheBust === undefined ? undefined : { params: { _: cacheBust } },
  );
}

/**
 * Run the broken-video heuristic scan on a single asset (re-scan on demand).
 */
export const scanSignalMetrics = assetsApi.scanSignalMetrics;

/**
 * Full stored `media_metadata.signal_metrics` for a single asset. Mirrors the
 * payload built by `services/asset/signal_analysis.build_signal_metrics_payload`
 * — including the heavy `chroma_fp` melody fingerprint that the list/detail
 * AssetResponse omits. All fields are optional/nullable (partial scans, older
 * scanner versions). Consumed by the Triage "Detection" popover.
 */
export interface SignalMetrics {
  score?: number | null;
  suspicious?: boolean | null;
  audio_rms_db?: number | null;
  audio_peak_db?: number | null;
  audio_sample_rate?: number | null;
  audio_channels?: number | null;
  phash_first_to_last?: number | null;
  phash_mean_div_from_first?: number | null;
  spectral_flatness?: number | null;
  tonal_frac?: number | null;
  /** Flat row-major 12×48 (time-major: bin*12 + pitchClass) chroma fingerprint. */
  chroma_fp?: number[] | null;
  loudness_range_db?: number | null;
  onset_rate?: number | null;
  syllabic_mod?: number | null;
  audio_ref_match?: number | null;
  render_ratio?: number | null;
  cohort_n?: number | null;
  cohort_p50_sec?: number | null;
  scanned_at?: string | null;
  scanner_version?: string | null;
  scan_mode?: string | null;
  user_override?: 'clean' | 'broken' | null;
  overridden_at?: string | null;
}

/**
 * Fetch the full signal_metrics for an asset (read-only). Returns
 * `signal_metrics: null` when the asset has never been scanned.
 */
export function getSignalMetrics(
  assetId: number,
): Promise<{ id: number; signal_metrics: SignalMetrics | null }> {
  return pixsimClient.get(`/assets/${assetId}/signal-metrics`);
}

/**
 * A curated `signalref:*` reference clip + its stored fingerprint — the
 * templates the broken-audio matcher cross-correlates against. Consumed by the
 * Video-Health "References" panel.
 */
export interface SignalReferenceItem {
  asset: AssetResponse;
  chroma_fp?: number[] | null;
  audio_ref_match?: number | null;
  loudness_range_db?: number | null;
  score?: number | null;
  /**
   * Per-category leave-one-out match (full `signalref:*` slug → 0..1): how well
   * this clip fits the rest of that category. Low = odd-one-out. Absent for a
   * clip that is the only member of its category.
   */
  cohesion?: Record<string, number> | null;
}

/** List the curated reference clips (admin-scoped, read-only). */
export function getSignalReferences(): Promise<{
  items: SignalReferenceItem[];
  total: number;
}> {
  return pixsimClient.get('/assets/signal-references');
}

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
