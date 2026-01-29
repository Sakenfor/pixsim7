/**
 * Pixverse Sync API helpers
 *
 * Functions for syncing Pixverse videos/images to local Assets
 * and rebuilding lineage from stored metadata.
 */
import { pixsimClient } from '@lib/api/client';

// ============================================================================
// Types
// ============================================================================

export interface SyncDryRunItem {
  video_id?: string;
  image_id?: string;
  already_imported: boolean;
  raw: Record<string, any>;
}

export interface SyncDryRunCategory {
  total_remote: number;
  existing_count: number;
  items: SyncDryRunItem[];
}

export interface SyncDryRunResponse {
  provider_id: string;
  account_id: number;
  limit: number;
  offset: number;
  videos: SyncDryRunCategory;
  images?: SyncDryRunCategory;
}

export interface SyncAssetsResponse {
  provider_id: string;
  account_id: number;
  videos: {
    created: number;
    skipped_existing: number;
  };
  images: {
    created: number;
    skipped_existing: number;
  };
}

export interface LineageRefreshResult {
  asset_id: number;
  provider_id: string;
  removed_edges: number;
  new_edges: number;
  status: string;
}

export interface LineageRefreshResponse {
  count: number;
  results: LineageRefreshResult[];
  message?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Dry-run sync for a Pixverse account.
 *
 * Scans remote videos/images and returns which ones are already imported locally.
 * Does not modify the database.
 */
export async function getPixverseSyncDryRun(
  accountId: number,
  params?: {
    limit?: number;
    offset?: number;
    includeImages?: boolean;
  }
): Promise<SyncDryRunResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
  if (params?.includeImages !== undefined) searchParams.set('include_images', String(params.includeImages));

  const query = searchParams.toString();
  const url = `/providers/pixverse/accounts/${accountId}/sync-dry-run${query ? `?${query}` : ''}`;

  return pixsimClient.get<SyncDryRunResponse>(url);
}

/**
 * Import missing Pixverse assets.
 *
 * Creates Asset records for remote videos/images that don't exist locally.
 * Does NOT create lineage - use refreshAssetLineage for that.
 */
export async function syncPixverseAssets(
  accountId: number,
  body: {
    mode: 'videos' | 'images' | 'both';
    limit?: number;
    offset?: number;
  }
): Promise<SyncAssetsResponse> {
  return pixsimClient.post<SyncAssetsResponse>(
    `/providers/pixverse/accounts/${accountId}/sync-assets`,
    {
      mode: body.mode,
      limit: body.limit ?? 100,
      offset: body.offset ?? 0,
    }
  );
}

/**
 * Refresh/rebuild lineage for assets.
 *
 * Uses stored provider metadata to re-extract embedded assets and rebuild
 * lineage relationships.
 *
 * Two modes:
 * 1. Explicit asset IDs: Pass assetIds to refresh specific assets
 * 2. Provider filter: Pass providerId to refresh all assets for that provider
 */
export async function refreshAssetLineage(params: {
  assetIds?: number[];
  providerId?: string;
  clearExisting?: boolean;
}): Promise<LineageRefreshResponse> {
  return pixsimClient.post<LineageRefreshResponse>(
    '/lineage/refresh',
    {
      asset_ids: params.assetIds,
      provider_id: params.providerId,
      scope: params.providerId ? 'current_user' : undefined,
      clear_existing: params.clearExisting ?? true,
    }
  );
}
