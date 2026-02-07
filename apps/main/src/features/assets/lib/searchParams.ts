import type { AssetSearchRequest } from '@lib/api/assets';

import type { AssetFilters } from '../hooks/useAssets';

type RegistryFilterValue =
  | string
  | boolean
  | number
  | string[]
  | boolean[]
  | number[];

const KNOWN_FILTER_KEYS = new Set([
  'q',
  'tag',
  'provider_id',
  'sort',
  'media_type',
  'upload_method',
  'provider_status',
  'include_archived',
  'created_from',
  'created_to',
  'min_width',
  'max_width',
  'min_height',
  'max_height',
  'content_domain',
  'content_category',
  'content_rating',
  'searchable',
  'source_generation_id',
  'source_asset_id',
  'prompt_version_id',
  'operation_type',
  'has_parent',
  'has_children',
  'sort_by',
  'sort_dir',
]);

export function extractExtraRegistryFilters(
  filters: AssetFilters
): Record<string, RegistryFilterValue> {
  const extras: Record<string, RegistryFilterValue> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (KNOWN_FILTER_KEYS.has(key)) return;
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        extras[key] = value as RegistryFilterValue;
      }
      return;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      extras[key] = value;
    }
  });
  return extras;
}

export function buildAssetSearchRequest(
  filters: AssetFilters,
  options?: {
    limit?: number;
    offset?: number;
    cursor?: string | null;
  }
): AssetSearchRequest {
  const registryFilters: Record<string, RegistryFilterValue> = {};
  if (filters.provider_id) {
    registryFilters.provider_id = filters.provider_id as RegistryFilterValue;
  }
  if (filters.media_type) {
    registryFilters.media_type = filters.media_type as RegistryFilterValue;
  }
  if (filters.upload_method) {
    registryFilters.upload_method = filters.upload_method as RegistryFilterValue;
  }

  const extras = extractExtraRegistryFilters(filters);
  Object.assign(registryFilters, extras);

  const sortBy =
    filters.sort_by ||
    (filters.sort === 'size' ? 'file_size_bytes' : filters.sort ? 'created_at' : undefined);
  const sortDir = filters.sort_dir || (filters.sort === 'old' ? 'asc' : 'desc');

  return {
    limit: options?.limit,
    offset: options?.offset,
    cursor: options?.offset === undefined ? options?.cursor || undefined : undefined,
    filters: Object.keys(registryFilters).length ? registryFilters : undefined,
    q: filters.q?.trim() || undefined,
    tag: filters.tag || undefined,
    provider_status: filters.provider_status || undefined,
    include_archived: filters.include_archived || undefined,
    created_from: filters.created_from || undefined,
    created_to: filters.created_to || undefined,
    min_width: filters.min_width,
    max_width: filters.max_width,
    min_height: filters.min_height,
    max_height: filters.max_height,
    content_domain: filters.content_domain || undefined,
    content_category: filters.content_category || undefined,
    content_rating: filters.content_rating || undefined,
    searchable: filters.searchable,
    source_generation_id: filters.source_generation_id,
    source_asset_id: filters.source_asset_id,
    prompt_version_id: filters.prompt_version_id || undefined,
    operation_type: filters.operation_type || undefined,
    has_parent: filters.has_parent,
    has_children: filters.has_children,
    sort_by: sortBy,
    sort_dir: sortDir,
  };
}
