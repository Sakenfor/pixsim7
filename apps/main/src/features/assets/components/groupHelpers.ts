import type { AssetGroupMeta } from '@lib/api/assets';

import type { GalleryGroupBy, GalleryGroupBySelection, GalleryGroupScope, GalleryGroupView } from '@features/panels';

import type { AssetModel } from '../hooks/useAssets';
import { normalizeGroupBySelection } from '../lib/groupBy';
import { GROUP_BY_VALUES } from '../lib/groupBy';
import { normalizeGroupScopeSelection } from '../lib/groupScope';
import { getAssetDisplayUrls } from '../models/asset';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetGroup = {
  key: string;
  label: string;
  previewAssets: AssetModel[];
  count: number;
  latestTimestamp: number;
  meta?: AssetGroupMeta | null;
};

export type GroupPathEntry = {
  groupBy: GalleryGroupBy;
  groupKey: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_GROUP_BY_STACK: GalleryGroupBy[] = [];
export const DEFAULT_GROUP_VIEW: GalleryGroupView = 'inline';
export const DEFAULT_GROUP_SCOPE: GalleryGroupScope = [];
export const GROUP_VIEW_VALUES: GalleryGroupView[] = ['inline', 'folders', 'panel'];
export const GROUP_PREVIEW_LIMIT = 4;
export const GROUP_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export const parsePageParam = (search: string) => {
  const params = new URLSearchParams(search);
  const raw = params.get('page');
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const parseGroupPageParam = (search: string) => {
  const params = new URLSearchParams(search);
  const raw = params.get('group_page');
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

export const parseGroupParams = (
  search: string,
  defaults: {
    groupView: GalleryGroupView;
    groupBy: GalleryGroupBySelection;
    groupScope: GalleryGroupScope;
  },
) => {
  const params = new URLSearchParams(search);
  const rawGroupByValues = params.getAll('group_by');
  const groupByValues = rawGroupByValues.length > 0 ? rawGroupByValues : params.get('group_by');
  const normalizedGroupBy = normalizeGroupBySelection(groupByValues);
  const groupBy = normalizedGroupBy.length > 0 ? normalizedGroupBy : normalizeGroupBySelection(defaults.groupBy);
  const rawGroupView = params.get('group_view') as GalleryGroupView | null;
  const groupView =
    rawGroupView && GROUP_VIEW_VALUES.includes(rawGroupView) ? rawGroupView : defaults.groupView;
  const rawGroupScopeValues = params.getAll('group_scope');
  const groupScopeValues = rawGroupScopeValues.length > 0 ? rawGroupScopeValues : params.get('group_scope');
  const normalizedGroupScope = normalizeGroupScopeSelection(groupScopeValues);
  const groupScope = normalizedGroupScope.length > 0 ? normalizedGroupScope : defaults.groupScope;
  const rawGroupPathValues = params.getAll('group_path');
  const rawGroupPath = rawGroupPathValues.length > 0 ? rawGroupPathValues : params.get('group_path');
  const pathEntries = (Array.isArray(rawGroupPath) ? rawGroupPath : rawGroupPath ? [rawGroupPath] : [])
    .map((entry) => {
      const [rawBy, rawKey] = entry.split(':', 2);
      if (!rawBy || !rawKey) return null;
      if (!GROUP_BY_VALUES.includes(rawBy as GalleryGroupBy)) return null;
      return { groupBy: rawBy as GalleryGroupBy, groupKey: rawKey };
    })
    .filter((entry): entry is { groupBy: GalleryGroupBy; groupKey: string } => !!entry);
  const groupKeyFallback = params.get('group_key');
  if (groupKeyFallback && groupBy.length > 0 && pathEntries.length === 0) {
    pathEntries.push({ groupBy: groupBy[0], groupKey: groupKeyFallback });
  }
  let resolvedGroupBy = groupBy;
  if (pathEntries.length > 0) {
    const pathOrder = Array.from(
      new Set(pathEntries.map((entry) => entry.groupBy)),
    );
    if (pathOrder.length > 0) {
      resolvedGroupBy = [
        ...pathOrder,
        ...groupBy.filter((value) => !pathOrder.includes(value)),
      ];
    }
  }
  const groupPath: { groupBy: GalleryGroupBy; groupKey: string }[] = [];
  if (resolvedGroupBy.length > 0 && pathEntries.length > 0) {
    for (const entryBy of resolvedGroupBy) {
      const match = pathEntries.find((entry) => entry.groupBy === entryBy);
      if (!match) break;
      groupPath.push(match);
    }
  }
  const groupPage = parseGroupPageParam(search);
  return {
    groupBy: resolvedGroupBy,
    groupView,
    groupScope,
    groupPath,
    groupPage,
  };
};

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

export const areScopesEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  for (const entry of right) {
    if (!leftSet.has(entry)) return false;
  }
  return true;
};

export const areGroupByStacksEqual = (left: GalleryGroupBy[], right: GalleryGroupBy[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

// ---------------------------------------------------------------------------
// Label formatting
// ---------------------------------------------------------------------------

export const formatGroupLabel = (
  groupBy: GalleryGroupBy,
  key: string,
  meta?: AssetGroupMeta | null,
) => {
  if (key === 'other') return 'Other';
  if (key === 'ungrouped') return 'Ungrouped';
  if (meta && meta.kind === 'prompt' && meta.prompt_text) {
    const text = meta.prompt_text.trim();
    if (text.length <= 80) return text;
    return `${text.slice(0, 77)}...`;
  }
  if (meta && meta.kind === 'source' && meta.description) {
    return meta.description;
  }
  if (meta && meta.kind === 'sibling' && meta.prompt_snippet) {
    return meta.prompt_snippet;
  }
  if (groupBy === 'source') return `Source #${key}`;
  if (groupBy === 'generation') return `Generation #${key}`;
  if (groupBy === 'prompt') return `Prompt ${key}`;
  if (groupBy === 'sibling') return `Sibling ${key.slice(0, 8)}`;
  return key;
};

// ---------------------------------------------------------------------------
// Preview asset selection
// ---------------------------------------------------------------------------

export const selectGroupPreviewAssets = (assets: AssetModel[]) => {
  return assets
    .filter((asset) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);
      if (thumbnailUrl || previewUrl) return true;
      if (asset.mediaType === 'image') return !!mainUrl;
      if (asset.mediaType === 'video') return !!(mainUrl || asset.remoteUrl || asset.fileUrl);
      return false;
    })
    .slice(0, GROUP_PREVIEW_LIMIT);
};
