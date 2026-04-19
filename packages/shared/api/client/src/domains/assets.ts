import type { PixSimApiClient } from '../client';
import type {
  AssetGenerationContext,
  AssetGroupBy,
  AssetGroupGenerationMeta,
  AssetGroupListResponse,
  AssetGroupPathEntry,
  AssetGroupPromptMeta,
  AssetGroupRequest as AssetGroupRequestSchema,
  AssetGroupSiblingMeta,
  AssetGroupSourceMeta,
  AssetGroupSummary,
  AssetListResponse,
  AssetResponse,
  AssetSearchRequest as AssetSearchRequestSchema,
  EnrichAssetResponse,
  ExtractFrameRequest,
  FilterDefinition,
  FilterOptionsRequest as FilterOptionsRequestSchema,
  FilterOptionsResponse,
  FilterOptionValue,
  ReuploadAssetRequest,
} from '@pixsim7/shared.api.model';
export type {
  AssetGenerationContext,
  AssetGroupBy,
  AssetGroupGenerationMeta,
  AssetGroupListResponse,
  AssetGroupPathEntry,
  AssetGroupPromptMeta,
  AssetGroupSiblingMeta,
  AssetGroupSourceMeta,
  AssetGroupSummary,
  AssetListResponse,
  AssetResponse,
  EnrichAssetResponse,
  ExtractFrameRequest,
  FilterDefinition,
  FilterOptionValue,
  ReuploadAssetRequest,
};

export type AssetSearchRequest = Partial<AssetSearchRequestSchema> & {
  /** Asset ID for visual similarity search (uses CLIP embeddings) */
  similar_to?: number;
  /** Min similarity 0-1, default 0.3 */
  similarity_threshold?: number;
  /** Whitelist of asset IDs to include */
  asset_ids?: number[];
  /** Include exact total count (can be expensive on large libraries) */
  include_total?: boolean;
};
export type ListAssetsQuery = AssetSearchRequest;

export type AssetGroupRequest =
  Partial<Omit<AssetGroupRequestSchema, 'group_by'>> &
  Pick<AssetGroupRequestSchema, 'group_by'>;
export type AssetGroupMeta =
  | AssetGroupSourceMeta
  | AssetGroupGenerationMeta
  | AssetGroupPromptMeta
  | AssetGroupSiblingMeta;

export type FilterMetadataResponse = FilterOptionsResponse;
export type FilterOptionsRequest =
  Omit<FilterOptionsRequestSchema, 'include_counts'> & {
    includeCounts?: boolean;
  };
export type FilterMetadataQueryOptions = FilterOptionsRequest;

export function getAssetDownloadUrl(asset: AssetResponse): string {
  return asset.remote_url || asset.file_url || `/assets/${asset.id}/file`;
}

export function createAssetsApi(client: PixSimApiClient) {
  return {
    async searchAssets(request?: AssetSearchRequest): Promise<AssetListResponse> {
      const payload = { include_total: false, ...(request || {}) };
      return client.post<AssetListResponse>('/assets/search', payload, { timeout: 120_000 });
    },

    async listAssets(query?: AssetSearchRequest): Promise<AssetListResponse> {
      const payload = { include_total: false, ...(query || {}) };
      return client.post<AssetListResponse>('/assets/search', payload, { timeout: 120_000 });
    },

    async listAssetGroups(request: AssetGroupRequest): Promise<AssetGroupListResponse> {
      return client.post<AssetGroupListResponse>('/assets/groups', request, { timeout: 120_000 });
    },

    async getAsset(assetId: number): Promise<AssetResponse> {
      return client.get<AssetResponse>(`/assets/${assetId}`);
    },

    async deleteAsset(
      assetId: number,
      options?: { delete_from_provider?: boolean }
    ): Promise<void> {
      await client.delete<void>(`/assets/${assetId}`, {
        params: options || {},
      });
    },

    async archiveAsset(
      assetId: number,
      archived: boolean
    ): Promise<{ id: number; is_archived: boolean; message: string }> {
      return client.patch<{ id: number; is_archived: boolean; message: string }>(
        `/assets/${assetId}/archive`,
        { archived }
      );
    },

    /**
     * Set or clear the user's manual override on the signal-based broken-video heuristic.
     * `override` = 'clean' (mark as kept) | 'broken' (confirm bad) | null (clear).
     */
    async setSignalOverride(
      assetId: number,
      override: 'clean' | 'broken' | null,
    ): Promise<{ id: number; override: 'clean' | 'broken' | null }> {
      return client.post<{ id: number; override: 'clean' | 'broken' | null }>(
        `/assets/${assetId}/signal-override`,
        { override }
      );
    },

    /**
     * Run the broken-video heuristic scan on a single asset. Useful for
     * re-scanning after the heuristic version changes or for assets that were
     * uploaded before the ingest-time hook was wired up.
     */
    async scanSignalMetrics(
      assetId: number,
      options?: { force?: boolean },
    ): Promise<{ id: number; signal_metrics: Record<string, unknown> | null }> {
      const params = options?.force === false ? '?force=false' : '';
      return client.post<{ id: number; signal_metrics: Record<string, unknown> | null }>(
        `/assets/${assetId}/scan-signal-metrics${params}`,
        {}
      );
    },

    async extractFrame(request: ExtractFrameRequest): Promise<AssetResponse> {
      return client.post<AssetResponse>('/assets/extract-frame', request);
    },

    async uploadAssetToProvider(assetId: number, providerId: string): Promise<void> {
      const payload: ReuploadAssetRequest = { provider_id: providerId };
      await client.post<void>(`/assets/${assetId}/reupload`, payload);
    },

    async getFilterMetadata(options?: FilterMetadataQueryOptions): Promise<FilterMetadataResponse> {
      const payload: Record<string, unknown> = {};
      if (options?.includeCounts) {
        payload.include_counts = true;
      }
      if (options?.include && options.include.length > 0) {
        payload.include = options.include;
      }
      if (options?.context && Object.keys(options.context).length > 0) {
        payload.context = options.context;
      }
      if (options?.limit) {
        payload.limit = options.limit;
      }
      return client.post<FilterMetadataResponse>('/assets/filter-options', payload, { timeout: 120_000 });
    },

    /**
     * Assign or remove tags from an asset.
     * Auto-creates tags if they don't exist.
     */
    async assignTags(
      assetId: number,
      request: { add?: string[]; remove?: string[] },
    ): Promise<AssetResponse> {
      return client.post<AssetResponse>(`/assets/${assetId}/tags/assign`, request);
    },

    /**
     * Enrich an asset by fetching metadata from the provider.
     * Creates a synthetic Generation record with prompt/params.
     * Set force=true to re-enrich assets that already have generations.
     */
    async enrichAsset(assetId: number, options?: { force?: boolean }): Promise<EnrichAssetResponse> {
      const query = options?.force ? '?force=true' : '';
      return client.post<EnrichAssetResponse>(`/assets/${assetId}/enrich${query}`);
    },

    async getAssetGenerationContext(assetId: number): Promise<AssetGenerationContext> {
      return client.get<AssetGenerationContext>(`/assets/${assetId}/generation-context`);
    },

    async bulkDeleteAssets(
      assetIds: number[],
      options?: { delete_from_provider?: boolean },
    ): Promise<{ deleted_count: number; total_requested: number; errors?: Array<{ asset_id: number; error: string }> }> {
      const query = options?.delete_from_provider !== undefined
        ? `?delete_from_provider=${options.delete_from_provider}`
        : '';
      return client.post(`/assets/bulk/delete${query}`, { asset_ids: assetIds });
    },
  };
}
