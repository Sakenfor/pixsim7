import type { IconName } from '@lib/icons';

import type { AssetFilters } from '@features/assets';

// ── Rule type definitions ───────────────────────────────────────────────

export type FilterRuleType =
  | 'tags'
  | 'mediaType'
  | 'search'
  | 'provider'
  | 'dateRange'
  | 'dimensions'
  | 'operationType'
  | 'lineage'
  | 'sortOrder'
  | 'maxResults'
  | 'uploadSource'
  | 'sourceFolder'
  | 'providerStatus'
  | 'contentElements'
  | 'styleTags'
  | 'missingMetadata'
  | 'includeArchived';

export interface RuleDefinition {
  label: string;
  icon: IconName;
  filterKeys: (keyof AssetFilters)[];
}

export const RULE_DEFINITIONS: Record<FilterRuleType, RuleDefinition> = {
  tags:            { label: 'Tags',             icon: 'tag',         filterKeys: ['tag', 'tag__mode' as keyof AssetFilters] },
  mediaType:       { label: 'Media Type',       icon: 'image',       filterKeys: ['media_type'] },
  search:          { label: 'Search',           icon: 'search',      filterKeys: ['q'] },
  provider:        { label: 'Provider',         icon: 'globe',       filterKeys: ['effective_provider_id' as keyof AssetFilters, 'provider_id'] },
  dateRange:       { label: 'Date Range',       icon: 'clock',       filterKeys: ['created_from', 'created_to'] },
  dimensions:      { label: 'Dimensions',       icon: 'maximize2',   filterKeys: ['min_width', 'max_width', 'min_height', 'max_height'] },
  operationType:   { label: 'Operation Type',   icon: 'layers',      filterKeys: ['operation_type'] },
  lineage:         { label: 'Lineage',          icon: 'git-branch',  filterKeys: ['has_parent', 'has_children'] },
  sortOrder:       { label: 'Sort Order',       icon: 'arrowUpDown', filterKeys: ['sort_by', 'sort_dir'] },
  maxResults:      { label: 'Max Results',      icon: 'hash',        filterKeys: [] },
  uploadSource:    { label: 'Upload Source',    icon: 'upload',      filterKeys: ['upload_method' as keyof AssetFilters] },
  sourceFolder:    { label: 'Source Folder',    icon: 'folderTree',  filterKeys: ['source_path' as keyof AssetFilters] },
  providerStatus:  { label: 'Provider Status',  icon: 'shield',      filterKeys: ['provider_status'] },
  contentElements: { label: 'Content',           icon: 'layers',      filterKeys: ['content_elements'] },
  styleTags:       { label: 'Style',             icon: 'sparkles',    filterKeys: ['style_tags'] },
  missingMetadata: { label: 'Missing Metadata', icon: 'fileQuestion', filterKeys: ['missing_prompt' as keyof AssetFilters, 'missing_analysis' as keyof AssetFilters, 'missing_embedding' as keyof AssetFilters, 'missing_tags' as keyof AssetFilters] },
  includeArchived: { label: 'Include Archived', icon: 'archive',     filterKeys: ['include_archived'] },
};

export const RULE_ORDER: FilterRuleType[] = [
  'tags', 'mediaType', 'search', 'provider', 'uploadSource', 'sourceFolder',
  'dateRange', 'dimensions', 'operationType', 'lineage',
  'contentElements', 'styleTags', 'providerStatus', 'missingMetadata',
  'sortOrder', 'maxResults', 'includeArchived',
];

/** Primary chips — always visible in the chip bar. */
export const PRIMARY_RULES: FilterRuleType[] = [
  'tags', 'mediaType', 'search', 'uploadSource', 'sourceFolder', 'dateRange',
];

/** Overflow chips — shown in the "..." menu. */
export const OVERFLOW_RULES: FilterRuleType[] = [
  'provider', 'dimensions', 'operationType', 'lineage', 'contentElements', 'styleTags', 'providerStatus',
  'missingMetadata', 'sortOrder', 'maxResults', 'includeArchived',
];

/** Count of active values for a given rule type. */
export function getActiveCount(
  ruleType: FilterRuleType,
  filters: AssetFilters,
  maxResults?: number,
): number {
  const rec = filters as Record<string, unknown>;
  switch (ruleType) {
    case 'tags': {
      const tags = filters.tag;
      if (!tags) return 0;
      return Array.isArray(tags) ? tags.length : 1;
    }
    case 'mediaType':
      return filters.media_type
        ? (Array.isArray(filters.media_type) ? filters.media_type.length : 1)
        : 0;
    case 'search':
      return filters.q ? 1 : 0;
    case 'provider': {
      const provider = (filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id;
      if (!provider) return 0;
      return Array.isArray(provider) ? provider.length : 1;
    }
    case 'uploadSource':
      return rec.upload_method
        ? (Array.isArray(rec.upload_method) ? rec.upload_method.length : 1)
        : 0;
    case 'sourceFolder':
      return rec.source_path ? 1 : 0;
    case 'dateRange': {
      let c = 0;
      if (filters.created_from) c++;
      if (filters.created_to) c++;
      return c;
    }
    case 'dimensions': {
      let c = 0;
      if (filters.min_width != null) c++;
      if (filters.max_width != null) c++;
      if (filters.min_height != null) c++;
      if (filters.max_height != null) c++;
      return c;
    }
    case 'operationType':
      return filters.operation_type ? 1 : 0;
    case 'lineage':
      return filters.has_parent != null || filters.has_children != null ? 1 : 0;
    case 'sortOrder':
      return filters.sort_by || filters.sort_dir ? 1 : 0;
    case 'maxResults':
      return maxResults != null ? 1 : 0;
    case 'providerStatus':
      return filters.provider_status ? 1 : 0;
    case 'contentElements': {
      const ce = filters.content_elements;
      if (!ce) return 0;
      return Array.isArray(ce) ? ce.length : 1;
    }
    case 'styleTags': {
      const st = filters.style_tags;
      if (!st) return 0;
      return Array.isArray(st) ? st.length : 1;
    }
    case 'missingMetadata': {
      let c = 0;
      if (rec.missing_prompt === true) c++;
      if (rec.missing_analysis === true) c++;
      if (rec.missing_embedding === true) c++;
      if (rec.missing_tags === true) c++;
      return c;
    }
    case 'includeArchived':
      return filters.include_archived ? 1 : 0;
    default:
      return 0;
  }
}

// ── Shared styles ───────────────────────────────────────────────────────

export const ruleInputClasses =
  'w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700';

export const ruleSelectClasses =
  'w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700';
