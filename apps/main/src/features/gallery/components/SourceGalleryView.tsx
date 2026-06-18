/**
 * SourceGalleryView — source-agnostic gallery view.
 *
 * Extracted (behavior-preserving) from the local-folders view so any source can
 * render through one pipeline: client-side filter -> group overview -> drill-down
 * -> paginate -> render AssetGallery -> viewer-scope sync, plus the two-pass
 * eager preview preload.
 *
 * Source-specific concerns are injected:
 *  - the group dimension semantics (bucket / label / preview-shim / favorite-key)
 *    as functions, generic over `TGroupBy`;
 *  - the grouping menu, drill breadcrumb, and batch-tools toolbar as slots /
 *    render-props (their inputs are view-internal, so they receive context);
 *  - the linked card-asset adapter as a hook injection.
 *
 * This is a 1:1 move of the orchestration that previously lived inline in
 * `LocalFoldersContent` — do NOT change UX here. See plan
 * `local-folders-as-gallery-source` / `retire-duplicated-view-logic`.
 */

import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { GroupFolderTile, GroupListRow } from '@features/assets/components/GroupCards';
import { GROUP_PAGE_SIZE, GROUP_PREVIEW_LIMIT, sortGroups, type AssetGroup, type GroupSortKey } from '@features/assets/components/groupHelpers';
import { PaginationStrip } from '@features/assets/components/shared/PaginationStrip';
import { useViewerScopeSync } from '@features/assets/hooks/useAssetViewer';
import type { useLocalAssetPreview } from '@features/assets/hooks/useLocalAssetPreview';
import type { AssetModel } from '@features/assets/models/asset';
import type { ViewerAsset } from '@features/assets/stores/assetViewerStore';
import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import { useClientFilterPersistence } from '@features/gallery/lib/useClientFilterPersistence';
import type { ClientFilterDef, ClientFilterState, ClientFilterValue } from '@features/gallery/lib/useClientFilters';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { usePagedItems } from '@features/gallery/lib/usePagedItems';
import { useScrollToTopOnChange } from '@features/gallery/lib/useScrollToTopOnChange';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';


type GroupSummary<TAsset> = {
  key: string;
  label: string;
  count: number;
  latestTimestamp: number;
  previewSeedAssets: TAsset[];
};

/** Render-prop context for the source-specific batch-tools toolbar. */
export interface SourceGalleryToolbarContext<TAsset> {
  filteredItems: TAsset[];
  pageItems: TAsset[];
  drilledItems: TAsset[];
  showDrilledView: boolean;
}

/** Render-prop context for the drill-down breadcrumb. */
export interface SourceGalleryBreadcrumbContext<TGroupBy extends string> {
  groupBy: TGroupBy;
  groupKey: string;
  itemCount: number;
  onBack: () => void;
}

export interface SourceGalleryViewProps<TAsset extends AssetModel, TGroupBy extends string> {
  // ---- Data ----
  assets: TAsset[];
  getAssetKey: (asset: TAsset) => string;

  // ---- Filtering (useClientFilters runs inside the view) ----
  filterDefs: ClientFilterDef<TAsset>[];
  filterStorageKey: string;
  /** Whether there is an active scope to render flat/grouped; gates the choose-scope empty state. */
  computeHasScope: (filterState: ClientFilterState) => boolean;

  // ---- Grouping (controlled) ----
  groupBy: TGroupBy | 'none';
  groupView: 'folders' | 'inline';
  groupSort: GroupSortKey;
  /** When there is no scope, force this dimension (e.g. 'folder') for bucketing only. */
  forcedGroupByWhenNoScope?: TGroupBy;
  bucketAssets: (assets: TAsset[], groupBy: TGroupBy) => Map<string, TAsset[]>;
  getGroupLabel: (groupBy: TGroupBy, key: string) => string;
  toPreviewShim: (asset: TAsset, previewUrl: string | undefined, idx: number) => AssetModel;
  buildFavoriteGroupKey: (groupBy: TGroupBy, key: string) => string;
  favoriteGroupKeys: ReadonlySet<string>;
  onToggleFavoriteGroup: (compositeKey: string) => void;
  /** Legacy inline subfolder grouping for the flat AssetGallery (only when no active grouping). */
  inlineGroupBy?: (asset: TAsset) => string;
  inlineGroupLabelForAsset?: (asset: TAsset) => string;

  // ---- Card callbacks (forwarded to AssetGallery) ----
  getPreviewUrl: (asset: TAsset) => string | undefined;
  resolvePreviewUrl: typeof useLocalAssetPreview;
  getMediaType: (asset: TAsset) => 'video' | 'image';
  getDescription: (asset: TAsset) => string;
  getTags: (asset: TAsset) => string[];
  getCreatedAt: (asset: TAsset) => string;
  getUploadState: (asset: TAsset) => AssetUploadState;
  getHashStatus: (asset: TAsset) => 'unique' | 'duplicate' | 'hashing' | undefined;
  getIsFavorite: (asset: TAsset) => boolean;
  getActions: (asset: TAsset) => MediaCardActions;
  onUpload: (asset: TAsset) => void;
  onUploadToProvider: (asset: TAsset, providerId: string) => Promise<void>;
  onToggleFavorite: (asset: TAsset) => Promise<void>;
  overlayPresetId?: string;
  /** Hook injection: resolve linked/canonical AssetModels for the currently visible cards. */
  useCardAssetAdapter?: (visibleAssets: TAsset[]) => { getMediaCardAsset?: (asset: TAsset) => AssetModel };

  // ---- Preview lifecycle ----
  loadPreview: (keyOrAsset: string | TAsset) => void;
  cancelPendingPreviews?: () => void;

  // ---- Viewer ----
  viewerScopeId: string;
  viewerScopeLabel: string;
  isViewerOpen: boolean;
  assetToViewer: (asset: TAsset, previewUrl?: string) => ViewerAsset;
  viewerPreviewMap?: Record<string, string>;
  onOpen: (asset: TAsset, viewerItems: TAsset[], resolvedPreviewUrl?: string) => Promise<void>;

  // ---- Active scope reporting ----
  onActiveAssetScopeChange?: (assetKeys: string[]) => void;

  // ---- Layout ----
  layout: 'masonry' | 'grid';
  cardSize: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  pageStorageKey: string;
  drilledGroupStorageKey: string;
  pageSize?: number;
  /** Extra values that, when changed, reset drill-down + group page (e.g. [selectedFolderPath, viewMode]). */
  scopeResetDeps?: unknown[];

  // ---- Slots (source-specific chrome) ----
  renderToolbar?: (ctx: SourceGalleryToolbarContext<TAsset>) => ReactNode;
  groupingMenuSlot?: ReactNode;
  renderBreadcrumb?: (ctx: SourceGalleryBreadcrumbContext<TGroupBy>) => ReactNode;

  // ---- Empty states ----
  emptyState?: ReactNode;
  chooseScopeEmptyState?: ReactNode;
  filteredEmptyState?: ReactNode;
  noGroupsEmptyState?: ReactNode;
}

const EMPTY_ADAPTER: { getMediaCardAsset?: (asset: never) => AssetModel } = {};
function useIdentityCardAssetAdapter() {
  return EMPTY_ADAPTER;
}

export function SourceGalleryView<TAsset extends AssetModel, TGroupBy extends string>(
  props: SourceGalleryViewProps<TAsset, TGroupBy>,
) {
  const {
    assets,
    getAssetKey,
    filterDefs,
    filterStorageKey,
    computeHasScope,
    groupBy,
    groupView,
    groupSort,
    forcedGroupByWhenNoScope,
    bucketAssets,
    getGroupLabel,
    toPreviewShim,
    buildFavoriteGroupKey,
    favoriteGroupKeys,
    onToggleFavoriteGroup,
    inlineGroupBy,
    inlineGroupLabelForAsset,
    getPreviewUrl,
    resolvePreviewUrl,
    getMediaType,
    getDescription,
    getTags,
    getCreatedAt,
    getUploadState,
    getHashStatus,
    getIsFavorite,
    getActions,
    onUpload,
    onUploadToProvider,
    onToggleFavorite,
    overlayPresetId,
    useCardAssetAdapter,
    loadPreview,
    cancelPendingPreviews,
    viewerScopeId,
    viewerScopeLabel,
    isViewerOpen,
    assetToViewer,
    viewerPreviewMap: viewerPreviewMapProp,
    onOpen,
    onActiveAssetScopeChange,
    layout,
    cardSize,
    scrollRef,
    pageStorageKey,
    drilledGroupStorageKey,
    pageSize = GROUP_PAGE_SIZE,
    scopeResetDeps,
    renderToolbar,
    groupingMenuSlot,
    renderBreadcrumb,
    emptyState,
    chooseScopeEmptyState,
    filteredEmptyState,
    noGroupsEmptyState,
  } = props;

  // --- Filter persistence + client-side filtering ---
  const filterOptions = useClientFilterPersistence(filterStorageKey);
  const {
    filteredItems,
    filterState,
    visibleDefs,
    setFilter,
    resetFilters,
    derivedOptions,
  } = useClientFilters(assets, filterDefs, filterOptions);

  // --- Scope detection ---
  const hasScope = useMemo(() => computeHasScope(filterState), [computeHasScope, filterState]);

  // Signature for the extra reset deps (e.g. selectedFolderPath, viewMode).
  const scopeResetSig = useMemo(() => JSON.stringify(scopeResetDeps ?? []), [scopeResetDeps]);

  // When no scope is active, force the configured dimension so the user sees
  // group tiles instead of a flat render of everything. Bucketing uses this;
  // the drill-reset key uses the raw `groupBy` (kept distinct on purpose).
  const effectiveGroupBy = (
    !hasScope && forcedGroupByWhenNoScope !== undefined
      ? forcedGroupByWhenNoScope
      : (groupBy as TGroupBy)
  );
  const hasActiveGrouping = effectiveGroupBy !== ('none' as TGroupBy) && effectiveGroupBy !== undefined;

  // --- Drill-down state (persisted in sessionStorage) ---
  const [drilledGroupKey, setDrilledGroupKeyRaw] = useState<string | null>(() => {
    try { return sessionStorage.getItem(drilledGroupStorageKey) || null; } catch { return null; }
  });
  const setDrilledGroupKey = useCallback((key: string | null) => {
    setDrilledGroupKeyRaw(key);
    try {
      if (key) sessionStorage.setItem(drilledGroupStorageKey, key);
      else sessionStorage.removeItem(drilledGroupStorageKey);
    } catch { /* quota */ }
  }, [drilledGroupStorageKey]);
  const showGroupOverview = hasActiveGrouping && drilledGroupKey === null;
  const showDrilledView = hasActiveGrouping && drilledGroupKey !== null;

  // Reset drill-down when grouping mode, scope, filters, or extra deps change.
  const groupResetKeyRef = useRef({ groupBy, filterState, hasScope, scopeResetSig });
  useEffect(() => {
    const prev = groupResetKeyRef.current;
    if (
      prev.groupBy !== groupBy ||
      prev.filterState !== filterState ||
      prev.hasScope !== hasScope ||
      prev.scopeResetSig !== scopeResetSig
    ) {
      setDrilledGroupKey(null);
      groupResetKeyRef.current = { groupBy, filterState, hasScope, scopeResetSig };
    }
  }, [groupBy, filterState, hasScope, scopeResetSig, setDrilledGroupKey]);

  // --- Group bucket cache: computed once per active scope and reused for drill-in ---
  const groupBuckets = useMemo(() => {
    if (!hasActiveGrouping) return new Map<string, TAsset[]>();
    return bucketAssets(filteredItems, effectiveGroupBy);
  }, [hasActiveGrouping, filteredItems, effectiveGroupBy, bucketAssets]);

  // --- Group summaries: stable metadata independent of preview URL churn ---
  const groupSummaries = useMemo<GroupSummary<TAsset>[]>(() => {
    if (!hasActiveGrouping || groupBuckets.size === 0) return [];

    const gb = effectiveGroupBy;
    const summaries: GroupSummary<TAsset>[] = [];

    for (const [key, bucket] of groupBuckets) {
      let latestTimestamp = 0;
      for (const asset of bucket) {
        const ts = (asset as { lastModified?: number }).lastModified;
        if (ts && ts > latestTimestamp) {
          latestTimestamp = ts;
        }
      }

      summaries.push({
        key,
        label: getGroupLabel(gb, key),
        count: bucket.length,
        latestTimestamp,
        previewSeedAssets: bucket.slice(0, GROUP_PREVIEW_LIMIT),
      });
    }

    return summaries;
  }, [hasActiveGrouping, groupBuckets, effectiveGroupBy, getGroupLabel]);

  // --- Group overview: stable group shapes + incremental preview hydration ---
  // The heavy group structure only recomputes when buckets change. Preview URLs
  // are layered on in a second pass with a ref cache so unchanged tiles keep the
  // same object reference when a single thumbnail loads.
  const stableGroups = useMemo(() => {
    if (!showGroupOverview || groupSummaries.length === 0) return [];
    return groupSummaries.map((summary) => ({
      key: summary.key,
      label: summary.label,
      count: summary.count,
      latestTimestamp: summary.latestTimestamp,
      seeds: summary.previewSeedAssets,
    }));
  }, [showGroupOverview, groupSummaries]);

  const hydratedGroupCacheRef = useRef(new Map<string, { urlKey: string; group: (typeof stableGroups)[0] & { previewAssets: AssetModel[] } }>());

  const groups = useMemo(() => {
    const cache = hydratedGroupCacheRef.current;
    if (stableGroups.length === 0) { cache.clear(); return []; }
    const currentKeys = new Set(stableGroups.map(g => g.key));
    for (const k of cache.keys()) { if (!currentKeys.has(k)) cache.delete(k); }

    return stableGroups.map((g) => {
      const urlKey = g.seeds.map(a => getPreviewUrl(a) || '').join('|');
      const cached = cache.get(g.key);
      if (cached && cached.urlKey === urlKey) return cached.group;

      const hydrated = {
        ...g,
        previewAssets: g.seeds.map((asset, idx) =>
          toPreviewShim(asset, getPreviewUrl(asset), idx),
        ),
      };
      cache.set(g.key, { urlKey, group: hydrated });
      return hydrated;
    });
  }, [stableGroups, getPreviewUrl, toPreviewShim]);

  // Sort from stableGroups (doesn't change on preview load) so downstream
  // pagination and eager preload key collection remain stable.
  const sortedStableGroups = useMemo(() => {
    if (stableGroups.length === 0) return [];
    return sortGroups(stableGroups as unknown as AssetGroup[], groupSort);
  }, [stableGroups, groupSort]);

  const sortedGroups = useMemo(() => {
    if (groups.length === 0) return [];
    return sortGroups(groups as unknown as AssetGroup[], groupSort) as unknown as typeof groups;
  }, [groups, groupSort]);

  // --- Drilled-in: O(1) lookup from cached buckets ---
  const drilledItems = useMemo(() => {
    if (!hasActiveGrouping || drilledGroupKey === null) return filteredItems;
    return groupBuckets.get(drilledGroupKey) ?? [];
  }, [hasActiveGrouping, drilledGroupKey, filteredItems, groupBuckets]);

  // --- Viewer scope sync: use drilled items when inside a group ---
  const viewerScopeItems = showDrilledView ? drilledItems : filteredItems;
  const viewerPreviewMap = isViewerOpen ? viewerPreviewMapProp : undefined;
  const viewerScopeAssets = useMemo<ViewerAsset[]>(
    () => {
      if (!isViewerOpen || viewerScopeItems.length === 0) return [];
      return viewerScopeItems.map((a) => assetToViewer(a, viewerPreviewMap?.[getAssetKey(a)]));
    },
    [isViewerOpen, viewerScopeItems, viewerPreviewMap, assetToViewer, getAssetKey],
  );
  const scopeLabel = showDrilledView
    ? `${viewerScopeLabel}: ${drilledGroupKey} (${viewerScopeItems.length})`
    : `${viewerScopeLabel} (${viewerScopeItems.length})`;
  useViewerScopeSync(viewerScopeId, scopeLabel, viewerScopeAssets, isViewerOpen);

  // Safety valve: drilled key vanished after a fast transition → back to overview.
  useEffect(() => {
    if (!showDrilledView) return;
    if (drilledItems.length > 0) return;
    setDrilledGroupKey(null);
  }, [showDrilledView, drilledItems.length, setDrilledGroupKey]);

  // --- Favorite groups: partition to top ---
  const favoriteGroupSet = favoriteGroupKeys;

  const stableFavoriteSortedKeys = useMemo(() => {
    if (sortedStableGroups.length === 0) return [];
    if (favoriteGroupSet.size === 0) return sortedStableGroups.map(g => g.key);
    const gb = effectiveGroupBy;
    const favKeys: string[] = [];
    const restKeys: string[] = [];
    for (const g of sortedStableGroups) {
      if (favoriteGroupSet.has(buildFavoriteGroupKey(gb, g.key))) {
        favKeys.push(g.key);
      } else {
        restKeys.push(g.key);
      }
    }
    return [...favKeys, ...restKeys];
  }, [sortedStableGroups, favoriteGroupSet, effectiveGroupBy, buildFavoriteGroupKey]);

  const favoriteSortedGroups = useMemo(() => {
    if (stableFavoriteSortedKeys.length === 0) return [];
    const groupMap = new Map(sortedGroups.map(g => [g.key, g]));
    return stableFavoriteSortedKeys.map(k => groupMap.get(k)).filter(Boolean) as typeof sortedGroups;
  }, [stableFavoriteSortedKeys, sortedGroups]);

  // --- Group overview pagination ---
  const [groupPage, setGroupPage] = useState(1);
  useEffect(() => { setGroupPage(1); }, [groupBy, groupSort, filterState, scopeResetSig]);

  const groupTotalPages = Math.max(1, Math.ceil(favoriteSortedGroups.length / pageSize));
  const pagedGroups = useMemo(() => {
    const start = (groupPage - 1) * pageSize;
    return favoriteSortedGroups.slice(start, start + pageSize);
  }, [favoriteSortedGroups, groupPage, pageSize]);
  const showGroupPagination = favoriteSortedGroups.length > pageSize;

  // --- Eagerly pre-load previews for visible group tiles (two passes) ---
  const stableGroupMap = useMemo(
    () => new Map(stableGroups.map(g => [g.key, g])),
    [stableGroups],
  );

  const { primaryKeys: groupPreviewKeysPrimary, secondaryKeys: groupPreviewKeysSecondary } = useMemo(() => {
    if (!showGroupOverview || stableFavoriteSortedKeys.length === 0) {
      return { primaryKeys: [] as string[], secondaryKeys: [] as string[] };
    }
    const start = (groupPage - 1) * pageSize;
    const end = Math.min(start + pageSize, stableFavoriteSortedKeys.length);
    const primary: string[] = [];
    const secondary: string[] = [];
    for (let i = start; i < end; i++) {
      const sg = stableGroupMap.get(stableFavoriteSortedKeys[i]);
      if (!sg) continue;
      for (let j = 0; j < sg.seeds.length; j++) {
        const assetKey = getAssetKey(sg.seeds[j]);
        if (!assetKey) continue;
        if (j === 0) primary.push(assetKey);
        else secondary.push(assetKey);
      }
    }
    return { primaryKeys: primary, secondaryKeys: secondary };
  }, [showGroupOverview, stableFavoriteSortedKeys, stableGroupMap, groupPage, pageSize, getAssetKey]);

  const loadPreviewRef = useRef(loadPreview);
  loadPreviewRef.current = loadPreview;
  const cancelPendingPreviewsRef = useRef(cancelPendingPreviews);
  cancelPendingPreviewsRef.current = cancelPendingPreviews;

  const primaryKeysRef = useRef(groupPreviewKeysPrimary);
  const secondaryKeysRef = useRef(groupPreviewKeysSecondary);
  primaryKeysRef.current = groupPreviewKeysPrimary;
  secondaryKeysRef.current = groupPreviewKeysSecondary;
  const primaryKeysSignature = groupPreviewKeysPrimary.join('\n');
  const secondaryKeysSignature = groupPreviewKeysSecondary.join('\n');

  useEffect(() => {
    const primary = primaryKeysRef.current;
    const secondary = secondaryKeysRef.current;
    if (primary.length === 0 && secondary.length === 0) return;
    cancelPendingPreviewsRef.current?.();
    const timer1 = setTimeout(() => {
      for (const key of primary) {
        loadPreviewRef.current(key);
      }
    }, 100);
    const timer2 = setTimeout(() => {
      for (const key of secondary) {
        loadPreviewRef.current(key);
      }
    }, 400);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };

  }, [primaryKeysSignature, secondaryKeysSignature]);

  // --- Pagination (persisted) — flat view and drilled-in view ---
  const itemsForPaging = showGroupOverview ? [] : (showDrilledView ? drilledItems : filteredItems);
  const persistedPage = useMemo(() => {
    try { const v = localStorage.getItem(pageStorageKey); return v ? Math.max(1, parseInt(v, 10) || 1) : 1; }
    catch { return 1; }
  }, [pageStorageKey]);
  const { pageItems, currentPage, totalPages, setCurrentPage, showPagination } =
    usePagedItems(itemsForPaging, pageSize, { initialPage: persistedPage });

  // Report on-screen assets so the source can scope/prioritize work to them.
  const pageItemKeys = useMemo(() => pageItems.map((a) => getAssetKey(a)), [pageItems, getAssetKey]);
  useEffect(() => {
    onActiveAssetScopeChange?.(pageItemKeys);
  }, [onActiveAssetScopeChange, pageItemKeys]);

  // Reset pagination on user-initiated filter changes
  const handleFilterChange = useCallback(
    (key: string, value: ClientFilterValue) => {
      setFilter(key, value);
      setCurrentPage(1);
    },
    [setFilter, setCurrentPage],
  );
  const handleFilterReset = useCallback(() => {
    resetFilters();
    setCurrentPage(1);
  }, [resetFilters, setCurrentPage]);

  useEffect(() => {
    try { localStorage.setItem(pageStorageKey, String(currentPage)); } catch { /* quota */ }
  }, [currentPage, pageStorageKey]);

  // --- Scroll to top on page change ---
  useScrollToTopOnChange(scrollRef, [currentPage, groupPage, drilledGroupKey]);

  // --- Legacy inline subfolder groupBy for AssetGallery (only when not grouping) ---
  const groupByFn = useMemo(() => {
    if (hasActiveGrouping) return undefined;
    if (!hasScope) return undefined;
    if (!inlineGroupBy) return undefined;
    return (asset: TAsset) => inlineGroupBy(asset);
  }, [hasActiveGrouping, hasScope, inlineGroupBy]);

  const groupLabelMap = useMemo(() => {
    if (!groupByFn || !inlineGroupLabelForAsset) return undefined;
    const map = new Map<string, string>();
    for (const asset of pageItems) {
      const key = groupByFn(asset);
      if (!map.has(key)) {
        map.set(key, inlineGroupLabelForAsset(asset));
      }
    }
    return map;
  }, [groupByFn, pageItems, inlineGroupLabelForAsset]);

  const getInlineGroupLabel = useCallback(
    (key: string) => groupLabelMap?.get(key) ?? key,
    [groupLabelMap],
  );

  const sortGroupSections = useCallback(
    (sections: Array<{ key: string; label: string; count: number }>) =>
      [...sections].sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  // Resolve cards to canonical/linked AssetModels for the currently visible page.
  const visibleCardAssets = useMemo(
    () => (showGroupOverview ? [] : pageItems),
    [showGroupOverview, pageItems],
  );
  const useCardAdapterHook = useCardAssetAdapter ?? useIdentityCardAssetAdapter;
  const { getMediaCardAsset } = useCardAdapterHook(visibleCardAssets);

  // --- Gallery onOpen wrapper ---
  const handleOpen = useCallback(
    (asset: TAsset, resolvedPreviewUrl?: string) => {
      const viewerItems = showDrilledView ? drilledItems : filteredItems;
      return onOpen(asset, viewerItems, resolvedPreviewUrl);
    },
    [onOpen, filteredItems, drilledItems, showDrilledView],
  );

  // --- Group drill-down handlers ---
  const openGroup = useCallback((key: string) => {
    setDrilledGroupKey(key);
    setCurrentPage(1);
  }, [setDrilledGroupKey, setCurrentPage]);

  const handleGroupBack = useCallback(() => {
    setDrilledGroupKey(null);
  }, [setDrilledGroupKey]);

  // --- Empty states ---
  const resolvedFilteredEmptyState = filteredEmptyState ?? (
    <GalleryEmptyState
      icon="search"
      title="No items match current filters"
      description="Try clearing filters or broadening the search."
    />
  );
  const resolvedChooseScopeEmptyState = chooseScopeEmptyState ?? (
    <GalleryEmptyState
      icon="folder"
      title="Choose a folder to start"
      description="Pick a folder from the Folder filter above."
    />
  );
  const resolvedEmptyState = emptyState ?? (
    <GalleryEmptyState icon="folder" title="No assets" description="This source has no items yet." />
  );

  // --- Render gallery (shared between flat & drilled views) ---
  const renderAssetGallery = (galleryAssets: TAsset[]) => (
    <AssetGallery
      assets={galleryAssets}
      getAssetKey={getAssetKey}
      getPreviewUrl={getPreviewUrl}
      resolvePreviewUrl={resolvePreviewUrl}
      loadPreview={loadPreview}
      getMediaType={getMediaType}
      getDescription={getDescription}
      getTags={getTags}
      getCreatedAt={getCreatedAt}
      getUploadState={getUploadState}
      getHashStatus={getHashStatus}
      onOpen={handleOpen}
      onUpload={onUpload}
      onUploadToProvider={onUploadToProvider}
      getIsFavorite={getIsFavorite}
      onToggleFavorite={onToggleFavorite}
      getActions={getActions}
      getMediaCardAsset={getMediaCardAsset}
      layout={layout}
      cardSize={cardSize}
      showAssetCount={!groupByFn}
      overlayPresetId={overlayPresetId}
      initialDisplayLimit={Infinity}
      groupBy={groupByFn}
      getGroupLabel={getInlineGroupLabel}
      sortGroupSections={groupByFn ? sortGroupSections : undefined}
      collapsibleGroups={!!groupByFn}
    />
  );

  // --- Main content ---
  const renderMainContent = () => {
    if (assets.length === 0) {
      return resolvedEmptyState;
    }

    if (!hasScope) {
      return resolvedChooseScopeEmptyState;
    }

    if (filteredItems.length === 0) {
      return resolvedFilteredEmptyState;
    }

    // --- Group overview (folder tiles or list rows) ---
    if (showGroupOverview) {
      if (favoriteSortedGroups.length === 0) {
        return noGroupsEmptyState ?? (
          <GalleryEmptyState
            icon="layers"
            title="No groups found"
            description="All items may belong to a single group, or try a different grouping dimension."
          />
        );
      }

      return (
        <>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            {favoriteSortedGroups.length} {favoriteSortedGroups.length === 1 ? 'group' : 'groups'}
          </div>
          {groupView === 'folders' ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), 1fr))`,
                rowGap: '12px',
                columnGap: '12px',
              }}
            >
              {pagedGroups.map((group) => {
                const compositeKey = buildFavoriteGroupKey(effectiveGroupBy, group.key);
                const isFav = favoriteGroupSet.has(compositeKey);
                return (
                  <div key={group.key} className="relative group/gtile">
                    <GroupFolderTile
                      group={group as unknown as AssetGroup}
                      cardSize={cardSize}
                      onOpen={() => openGroup(group.key)}
                    />
                    <button
                      type="button"
                      className={`absolute top-2 right-2 z-10 p-1 rounded-md transition-colors ${
                        isFav
                          ? 'text-amber-400 hover:text-amber-500'
                          : 'text-neutral-400 opacity-0 group-hover/gtile:opacity-100 hover:text-amber-400'
                      }`}
                      title={isFav ? 'Unpin group' : 'Pin group'}
                      onClick={(e) => { e.stopPropagation(); onToggleFavoriteGroup(compositeKey); }}
                    >
                      <Icon name="pin" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pagedGroups.map((group) => {
                const compositeKey = buildFavoriteGroupKey(effectiveGroupBy, group.key);
                const isFav = favoriteGroupSet.has(compositeKey);
                return (
                  <div key={group.key} className="relative group/grow">
                    <GroupListRow
                      group={group as unknown as AssetGroup}
                      cardSize={cardSize}
                      onOpen={() => openGroup(group.key)}
                    />
                    <button
                      type="button"
                      className={`absolute top-1/2 -translate-y-1/2 right-3 z-10 p-1 rounded-md transition-colors ${
                        isFav
                          ? 'text-amber-400 hover:text-amber-500'
                          : 'text-neutral-400 opacity-0 group-hover/grow:opacity-100 hover:text-amber-400'
                      }`}
                      title={isFav ? 'Unpin group' : 'Pin group'}
                      onClick={(e) => { e.stopPropagation(); onToggleFavoriteGroup(compositeKey); }}
                    >
                      <Icon name="pin" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      );
    }

    // --- Drilled-in view ---
    if (showDrilledView) {
      return drilledItems.length === 0 ? resolvedFilteredEmptyState : renderAssetGallery(pageItems);
    }

    // --- Flat view ---
    return renderAssetGallery(pageItems);
  };

  const showFlatPagination = !showGroupOverview && hasScope && showPagination;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
      {assets.length > 0 && (
        <div className="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2">
          <div className="flex items-center gap-1">
            {hasScope && renderToolbar?.({ filteredItems, pageItems, drilledItems, showDrilledView })}
            {hasScope && groupingMenuSlot}
            <ClientFilterBar
              defs={visibleDefs}
              filterState={filterState}
              derivedOptions={derivedOptions}
              onFilterChange={handleFilterChange}
              onReset={handleFilterReset}
            />
          </div>
          {showFlatPagination && (
            <div className="mt-2">
              <PaginationStrip
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
          {showGroupOverview && showGroupPagination && (
            <div className="mt-2">
              <PaginationStrip
                currentPage={groupPage}
                totalPages={groupTotalPages}
                onPageChange={setGroupPage}
              />
            </div>
          )}
          {showDrilledView && renderBreadcrumb && (
            <div className="mt-2">
              {renderBreadcrumb({
                groupBy: effectiveGroupBy,
                groupKey: drilledGroupKey!,
                itemCount: drilledItems.length,
                onBack: handleGroupBack,
              })}
            </div>
          )}
        </div>
      )}
      {renderMainContent()}
    </div>
  );
}
