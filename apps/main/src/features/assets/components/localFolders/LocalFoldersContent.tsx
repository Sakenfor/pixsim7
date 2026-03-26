import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon, Icons } from '@lib/icons';

import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import { useClientFilterPersistence } from '@features/gallery/lib/useClientFilterPersistence';
import type { ClientFilterDef } from '@features/gallery/lib/useClientFilters';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { usePagedItems } from '@features/gallery/lib/usePagedItems';
import { useScrollToTopOnChange } from '@features/gallery/lib/useScrollToTopOnChange';


import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';


import { useViewerScopeSync } from '../../hooks/useAssetViewer';
import { useLocalAssetPreview } from '../../hooks/useLocalAssetPreview';
import {
  canUploadToLibraryFromState,
  isFailedUploadState,
  isPendingUploadState,
  resolveLocalUploadState,
} from '../../lib/localAssetState';
import {
  buildFavoriteGroupKey,
  bucketLocalAssetModels,
  getLocalGroupLabel,
  localAssetToPreviewShim,
  type LocalGroupBy,
} from '../../lib/localGroupEngine';
import { getUploadCapableProviders } from '../../lib/resolveUploadTarget';
import type { AssetModel } from '../../models/asset';
import type { ViewerAsset } from '../../stores/assetViewerStore';
import { useLocalFolderSettingsStore } from '../../stores/localFolderSettingsStore';
import type { LocalAssetModel } from '../../types/localFolderMeta';
import { GroupFolderTile, GroupListRow } from '../GroupCards';
import { GROUP_PAGE_SIZE, GROUP_PREVIEW_LIMIT, sortGroups, type AssetGroup } from '../groupHelpers';
import { PaginationStrip } from '../shared/PaginationStrip';

import {
  DRILLED_GROUP_KEY,
  FILTER_STATE_KEY,
  LOCAL_MEDIA_CARD_PRESET,
  PAGE_KEY,
} from './constants';
import { LocalGroupBreadcrumb } from './LocalGroupBreadcrumb';
import { LocalGroupingMenu } from './LocalGroupingMenu';
import { useLocalFolderCardAssetAdapter } from './useLocalFolderCardAssetAdapter';

type LocalGroupSummary = {
  key: string;
  label: string;
  count: number;
  latestTimestamp: number;
  previewSeedAssets: LocalAssetModel[];
};

export interface LocalFoldersContentProps {
  controller: LocalFoldersController;
  localFilterDefs: ClientFilterDef<LocalAssetModel>[];
  favoriteFoldersSet: ReadonlySet<string>;
  layout: 'masonry' | 'grid';
  cardSize: number;
  contentScrollRef: RefObject<HTMLDivElement | null>;
  // Callbacks from useLocalFolderCallbacks
  getAssetKey: (asset: LocalAssetModel) => string;
  getPreviewUrl: (asset: LocalAssetModel) => string | undefined;
  getMediaType: (asset: LocalAssetModel) => 'video' | 'image';
  getDescription: (asset: LocalAssetModel) => string;
  getTags: (asset: LocalAssetModel) => string[];
  getCreatedAt: (asset: LocalAssetModel) => string;
  getUploadState: (asset: LocalAssetModel) => AssetUploadState;
  getHashStatus: (asset: LocalAssetModel) => 'unique' | 'duplicate' | 'hashing' | undefined;
  openAssetInViewer: (asset: LocalAssetModel, viewerItems: LocalAssetModel[], resolvedPreviewUrl?: string) => Promise<void>;
  handleUpload: (asset: LocalAssetModel) => void;
  handleUploadToProvider: (asset: LocalAssetModel, providerId: string) => Promise<void>;
  getIsFavorite: (asset: LocalAssetModel) => boolean;
  handleToggleFavorite: (asset: LocalAssetModel) => Promise<void>;
  getLocalMediaCardActions: (asset: LocalAssetModel) => MediaCardActions;
  toGenerationInputAsset: (asset: LocalAssetModel) => AssetModel;
  // Grouping helpers
  getSubfolderValue: (asset: LocalAssetModel) => string;
  getSubfolderLabelForAsset: (asset: LocalAssetModel) => string;
  // Viewer scope sync
  localAssetToViewer: (asset: LocalAssetModel, previewUrl?: string) => ViewerAsset;
  isViewerOpen: boolean;
}

export function LocalFoldersContent({
  controller,
  localFilterDefs,
  favoriteFoldersSet,
  layout,
  cardSize,
  contentScrollRef,
  getAssetKey,
  getPreviewUrl,
  getMediaType,
  getDescription,
  getTags,
  getCreatedAt,
  getUploadState,
  getHashStatus,
  openAssetInViewer,
  handleUpload,
  handleUploadToProvider,
  getIsFavorite,
  handleToggleFavorite,
  getLocalMediaCardActions,
  toGenerationInputAsset,
  getSubfolderValue,
  getSubfolderLabelForAsset,
  localAssetToViewer,
  isViewerOpen,
}: LocalFoldersContentProps) {
  // --- Filter persistence ---
  const filterOptions = useClientFilterPersistence(FILTER_STATE_KEY);

  // --- Client-side filtering ---
  const {
    filteredItems,
    filterState,
    visibleDefs,
    setFilter,
    resetFilters,
    derivedOptions,
  } = useClientFilters(controller.assets, localFilterDefs, filterOptions);

  // --- Folder scope detection ---
  const hasFolderScope = useMemo(() => {
    const folderSel = filterState.folder;
    const hasFolderFilter = Array.isArray(folderSel) && folderSel.length > 0;
    const favSel = filterState.favorites;
    const hasFavFolderScope = Array.isArray(favSel) && favSel.includes('folders') && favoriteFoldersSet.size > 0;
    return hasFolderFilter || hasFavFolderScope;
  }, [filterState.folder, filterState.favorites, favoriteFoldersSet.size]);

  // --- Group settings from persisted store ---
  const localGroupBy = useLocalFolderSettingsStore((s) => s.localGroupBy);
  const localGroupView = useLocalFolderSettingsStore((s) => s.localGroupView);
  const localGroupSort = useLocalFolderSettingsStore((s) => s.localGroupSort);
  const setLocalGroupBy = useLocalFolderSettingsStore((s) => s.setLocalGroupBy);
  const setLocalGroupView = useLocalFolderSettingsStore((s) => s.setLocalGroupView);
  const setLocalGroupSort = useLocalFolderSettingsStore((s) => s.setLocalGroupSort);
  const favoriteGroups = useLocalFolderSettingsStore((s) => s.favoriteGroups);
  const toggleFavoriteGroup = useLocalFolderSettingsStore((s) => s.toggleFavoriteGroup);

  const hasActiveGrouping = hasFolderScope && localGroupBy !== 'none';

  // --- Drill-down state for group navigation (persisted in sessionStorage) ---
  const [drilledGroupKey, setDrilledGroupKeyRaw] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DRILLED_GROUP_KEY) || null; } catch { return null; }
  });
  const setDrilledGroupKey = useCallback((key: string | null) => {
    setDrilledGroupKeyRaw(key);
    try {
      if (key) sessionStorage.setItem(DRILLED_GROUP_KEY, key);
      else sessionStorage.removeItem(DRILLED_GROUP_KEY);
    } catch { /* quota */ }
  }, []);
  const showGroupOverview = hasActiveGrouping && drilledGroupKey === null;
  const showDrilledView = hasActiveGrouping && drilledGroupKey !== null;

  // Reset drill-down when grouping mode, folder scope, filters, or tree selection changes.
  // Tree folder navigation can change the active asset scope without touching filterState.
  const groupResetKeyRef = useRef({
    localGroupBy,
    filterState,
    hasFolderScope,
    selectedFolderPath: controller.selectedFolderPath,
    viewMode: controller.viewMode,
  });
  useEffect(() => {
    const prev = groupResetKeyRef.current;
    if (
      prev.localGroupBy !== localGroupBy ||
      prev.filterState !== filterState ||
      prev.hasFolderScope !== hasFolderScope ||
      prev.selectedFolderPath !== controller.selectedFolderPath ||
      prev.viewMode !== controller.viewMode
    ) {
      setDrilledGroupKey(null);
      groupResetKeyRef.current = {
        localGroupBy,
        filterState,
        hasFolderScope,
        selectedFolderPath: controller.selectedFolderPath,
        viewMode: controller.viewMode,
      };
    }
  }, [localGroupBy, filterState, hasFolderScope, controller.selectedFolderPath, controller.viewMode]);

  // --- Group bucket cache: computed once per active scope and reused for drill-in ---
  const groupBuckets = useMemo(() => {
    if (!hasActiveGrouping) return new Map<string, LocalAssetModel[]>();
    return bucketLocalAssetModels(filteredItems, localGroupBy as LocalGroupBy);
  }, [hasActiveGrouping, filteredItems, localGroupBy]);

  // --- Group summaries: stable metadata independent of preview URL churn ---
  const groupSummaries = useMemo<LocalGroupSummary[]>(() => {
    if (!hasActiveGrouping || groupBuckets.size === 0) return [];

    const gb = localGroupBy as LocalGroupBy;
    const summaries: LocalGroupSummary[] = [];

    for (const [key, bucket] of groupBuckets) {
      let latestTimestamp = 0;
      for (const asset of bucket) {
        if (asset.lastModified && asset.lastModified > latestTimestamp) {
          latestTimestamp = asset.lastModified;
        }
      }

      summaries.push({
        key,
        label: getLocalGroupLabel(gb, key),
        count: bucket.length,
        latestTimestamp,
        previewSeedAssets: bucket.slice(0, GROUP_PREVIEW_LIMIT),
      });
    }

    return summaries;
  }, [hasActiveGrouping, groupBuckets, localGroupBy]);

  // --- Group overview: stable group shapes + incremental preview hydration ---
  // The heavy group structure (keys, labels, counts, seed assets) only recomputes
  // when buckets change. Preview URLs are layered on top in a second pass.
  // To avoid re-rendering ALL tiles when a single thumbnail loads, we keep a
  // ref cache of hydrated groups and only replace entries whose preview URLs
  // actually changed — React sees the same object reference for unchanged tiles.
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
    // Clear stale entries if stableGroups changed (different set of group keys)
    if (stableGroups.length === 0) { cache.clear(); return []; }
    const currentKeys = new Set(stableGroups.map(g => g.key));
    for (const k of cache.keys()) { if (!currentKeys.has(k)) cache.delete(k); }

    return stableGroups.map((g) => {
      // Build a cheap signature of which preview URLs this group would get
      const urlKey = g.seeds.map(a => getPreviewUrl(a) || '').join('|');
      const cached = cache.get(g.key);
      if (cached && cached.urlKey === urlKey) return cached.group;

      const hydrated = {
        ...g,
        previewAssets: g.seeds.map((asset, idx) =>
          localAssetToPreviewShim(asset, getPreviewUrl(asset), idx),
        ),
      };
      cache.set(g.key, { urlKey, group: hydrated });
      return hydrated;
    });
  }, [stableGroups, getPreviewUrl]);

  // Sort from stableGroups (doesn't change on preview load) so downstream
  // pagination and eager preload key collection remain stable.
  const sortedStableGroups = useMemo(() => {
    if (stableGroups.length === 0) return [];
    return sortGroups(stableGroups as unknown as AssetGroup[], localGroupSort);
  }, [stableGroups, localGroupSort]);

  // Hydrated sorted groups for rendering (changes when preview URLs change)
  const sortedGroups = useMemo(() => {
    if (groups.length === 0) return [];
    return sortGroups(groups, localGroupSort);
  }, [groups, localGroupSort]);

  // --- Drilled-in: O(1) lookup from cached buckets instead of re-filtering all items ---
  const drilledItems = useMemo(() => {
    if (!hasActiveGrouping || drilledGroupKey === null) return filteredItems;
    return groupBuckets.get(drilledGroupKey) ?? [];
  }, [hasActiveGrouping, drilledGroupKey, filteredItems, groupBuckets]);

  // --- Viewer scope sync: use drilled items when inside a group ---
  const viewerScopeItems = showDrilledView ? drilledItems : filteredItems;
  const viewerPreviewMap = isViewerOpen ? controller.previews : undefined;
  const viewerScopeAssets = useMemo<ViewerAsset[]>(
    () => {
      // Building 10k+ viewer assets on every preview update is expensive.
      // Only derive scope assets while the viewer is actually open.
      if (!isViewerOpen || viewerScopeItems.length === 0) return [];
      return viewerScopeItems.map((a) => localAssetToViewer(a, viewerPreviewMap?.[a.key]));
    },
    [isViewerOpen, viewerScopeItems, viewerPreviewMap, localAssetToViewer],
  );
  const scopeLabel = showDrilledView
    ? `Local: ${drilledGroupKey} (${viewerScopeItems.length})`
    : `Local (${viewerScopeItems.length})`;
  useViewerScopeSync('local', scopeLabel, viewerScopeAssets, isViewerOpen);

  // Safety valve: if the active drill-down key no longer exists after a fast scope/filter
  // transition, return to the group overview instead of staying on a stale group.
  useEffect(() => {
    if (!showDrilledView) return;
    if (drilledItems.length > 0) return;
    setDrilledGroupKey(null);
  }, [showDrilledView, drilledItems.length]);

  // --- Favorite groups: partition to top ---
  const favoriteGroupSet = useMemo(
    () => new Set(favoriteGroups),
    [favoriteGroups],
  );

  // Stable sort order for pagination + eager preload (doesn't change on preview load)
  const stableFavoriteSortedKeys = useMemo(() => {
    if (sortedStableGroups.length === 0) return [];
    if (favoriteGroupSet.size === 0) return sortedStableGroups.map(g => g.key);
    const gb = localGroupBy as LocalGroupBy;
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
  }, [sortedStableGroups, favoriteGroupSet, localGroupBy]);

  // Hydrated groups in the same order for rendering
  const favoriteSortedGroups = useMemo(() => {
    if (stableFavoriteSortedKeys.length === 0) return [];
    const groupMap = new Map(sortedGroups.map(g => [g.key, g]));
    return stableFavoriteSortedKeys.map(k => groupMap.get(k)).filter(Boolean) as typeof sortedGroups;
  }, [stableFavoriteSortedKeys, sortedGroups]);

  // --- Group overview pagination ---
  const [groupPage, setGroupPage] = useState(1);
  useEffect(() => { setGroupPage(1); }, [
    localGroupBy,
    localGroupSort,
    filterState,
    controller.selectedFolderPath,
    controller.viewMode,
  ]);

  const groupTotalPages = Math.max(1, Math.ceil(favoriteSortedGroups.length / GROUP_PAGE_SIZE));
  const pagedGroups = useMemo(() => {
    const start = (groupPage - 1) * GROUP_PAGE_SIZE;
    return favoriteSortedGroups.slice(start, start + GROUP_PAGE_SIZE);
  }, [favoriteSortedGroups, groupPage]);
  const showGroupPagination = favoriteSortedGroups.length > GROUP_PAGE_SIZE;

  // --- Eagerly pre-load previews for visible group tiles ---
  // Two passes: first pass loads 1 preview per group on the current page (fast
  // visual fill), second pass backfills remaining previews per group.
  // cancelPendingPreviews() drains the queue on page/view changes so stale
  // loads don't pile up.
  // Collect preview keys from stableGroups (NOT from hydrated groups) so the
  // key list doesn't change every time a thumbnail finishes loading.
  const stableGroupMap = useMemo(
    () => new Map(stableGroups.map(g => [g.key, g])),
    [stableGroups],
  );

  const { primaryKeys: groupPreviewKeysPrimary, secondaryKeys: groupPreviewKeysSecondary } = useMemo(() => {
    if (!showGroupOverview || stableFavoriteSortedKeys.length === 0) {
      return { primaryKeys: [] as string[], secondaryKeys: [] as string[] };
    }
    const start = (groupPage - 1) * GROUP_PAGE_SIZE;
    const end = Math.min(start + GROUP_PAGE_SIZE, stableFavoriteSortedKeys.length);
    const primary: string[] = [];
    const secondary: string[] = [];
    for (let i = start; i < end; i++) {
      const sg = stableGroupMap.get(stableFavoriteSortedKeys[i]);
      if (!sg) continue;
      for (let j = 0; j < sg.seeds.length; j++) {
        const assetKey = sg.seeds[j].key;
        if (!assetKey) continue;
        if (j === 0) primary.push(assetKey);
        else secondary.push(assetKey);
      }
    }
    return { primaryKeys: primary, secondaryKeys: secondary };
  }, [showGroupOverview, stableFavoriteSortedKeys, stableGroupMap, groupPage]);

  // Use refs for controller callbacks so the effect only re-fires when the
  // key lists actually change, not on every render.
  const loadPreviewRef = useRef(controller.loadPreview);
  loadPreviewRef.current = controller.loadPreview;
  const cancelPendingPreviewsRef = useRef(controller.cancelPendingPreviews);
  cancelPendingPreviewsRef.current = controller.cancelPendingPreviews;

  // Stabilize key lists: the memo produces new array refs when upstream state
  // changes (e.g. hash updates), but the actual key VALUES are the same.
  // Join into a string so the effect only fires when keys truly change.
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
    // Cancel stale preview queue from previous page/view
    cancelPendingPreviewsRef.current?.();
    // First pass: 1 preview per group (fills tiles quickly)
    const timer1 = setTimeout(() => {
      for (const key of primary) {
        loadPreviewRef.current(key);
      }
    }, 100);
    // Second pass: remaining previews (backfill)
    const timer2 = setTimeout(() => {
      for (const key of secondary) {
        loadPreviewRef.current(key);
      }
    }, 400);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
   
  }, [primaryKeysSignature, secondaryKeysSignature]);

  // --- Pagination (persisted) — used for flat view and drilled-in view ---
  const itemsForPaging = showGroupOverview ? [] : (showDrilledView ? drilledItems : filteredItems);
  const persistedPage = useMemo(() => {
    try { const v = localStorage.getItem(PAGE_KEY); return v ? Math.max(1, parseInt(v, 10) || 1) : 1; }
    catch { return 1; }

  }, []);
  const { pageItems, currentPage, totalPages, setCurrentPage, showPagination } =
    usePagedItems(itemsForPaging, GROUP_PAGE_SIZE, { initialPage: persistedPage });

  useEffect(() => {
    try { localStorage.setItem(PAGE_KEY, String(currentPage)); } catch { /* quota */ }
  }, [currentPage]);

  // --- Scroll to top on page change ---
  useScrollToTopOnChange(contentScrollRef, [currentPage, groupPage, drilledGroupKey]);

  // --- Legacy inline subfolder groupBy for AssetGallery (only when not using new grouping) ---
  const groupByFn = useMemo(() => {
    if (hasActiveGrouping) return undefined;
    if (!hasFolderScope) return undefined;
    return (asset: LocalAssetModel) => getSubfolderValue(asset);
  }, [hasActiveGrouping, hasFolderScope, getSubfolderValue]);

  // Build a label map from pageItems so getGroupLabel can resolve keys
  const groupLabelMap = useMemo(() => {
    if (!groupByFn) return undefined;
    const map = new Map<string, string>();
    for (const asset of pageItems) {
      const key = groupByFn(asset);
      if (!map.has(key)) {
        map.set(key, getSubfolderLabelForAsset(asset));
      }
    }
    return map;
  }, [groupByFn, pageItems, getSubfolderLabelForAsset]);

  const getGroupLabel = useCallback(
    (key: string) => groupLabelMap?.get(key) ?? key,
    [groupLabelMap],
  );

  const sortGroupSections = useCallback(
    (sections: Array<{ key: string; label: string; count: number }>) =>
      [...sections].sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  // Resolve local-folder cards to canonical AssetModels when a linked library
  // asset exists, while preserving local preview/path metadata for display.
  const visibleCardAssets = useMemo(
    () => (showGroupOverview ? [] : pageItems),
    [showGroupOverview, pageItems],
  );
  const { getMediaCardAsset } = useLocalFolderCardAssetAdapter({
    visibleAssets: visibleCardAssets,
    toFallbackAsset: toGenerationInputAsset,
  });

  // --- Tools dropdown (hash + batch upload) ---
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);

  // When drilled into a group, scope counts to only the visible items
  const visibleItems = showDrilledView ? drilledItems : filteredItems;

  const unhashedCount = useMemo(
    () => visibleItems.filter((a) => !a.sha256).length,
    [visibleItems],
  );

  const { pendingUploadCount, failedUploadCount } = useMemo(() => {
    let pending = 0;
    let failed = 0;
    for (const a of visibleItems) {
      const state = resolveLocalUploadState(a, controller.uploadStatus);
      if (isPendingUploadState(state)) pending++;
      else if (isFailedUploadState(state)) failed++;
    }
    return { pendingUploadCount: pending, failedUploadCount: failed };
  }, [visibleItems, controller.uploadStatus]);

  const handleHashUnhashed = useCallback(() => {
    if (showDrilledView) {
      // When drilled into a group, only hash the visible unhashed items
      const unhashedKeys = drilledItems.filter((a) => !a.sha256).map((a) => a.key);
      controller.hashAssets(unhashedKeys);
    } else {
      const folders = filterState.folder;
      if (!Array.isArray(folders)) return;
      for (const folderId of folders) {
        controller.hashFolder(folderId);
      }
    }
    setToolsOpen(false);
  }, [controller, filterState.folder, showDrilledView, drilledItems]);

  const batchUploadingRef = useRef(false);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), []);

  const handleBatchUpload = useCallback(async (target: 'library' | string) => {
    if (batchUploadingRef.current) return;
    batchUploadingRef.current = true;
    setToolsOpen(false);

    const pending = visibleItems.filter((asset) => {
      const status = resolveLocalUploadState(asset, controller.uploadStatus);
      if (status === 'uploading') return false;

      if (target === 'library') {
        return canUploadToLibraryFromState(status);
      }

      const normalizedTarget = target.trim().toLowerCase();
      const lastProviderId = String(asset.last_upload_provider_id || '').trim().toLowerCase();
      const uploadedToSelectedProvider = status === 'success' && lastProviderId === normalizedTarget;
      return !uploadedToSelectedProvider;
    });

    const CONCURRENCY = 3;
    let cursor = 0;

    const runWorker = async () => {
      while (cursor < pending.length) {
        const asset = pending[cursor++];
        try {
          if (target === 'library') {
            await handleUpload(asset);
          } else {
            await handleUploadToProvider(asset, target);
          }
        } catch { /* individual errors handled inside */ }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, runWorker));
    batchUploadingRef.current = false;
  }, [visibleItems, controller.uploadStatus, handleUpload, handleUploadToProvider]);

  const uploadActionCount = pendingUploadCount + failedUploadCount;
  const hashedCount = visibleItems.length - unhashedCount;
  const hasToolActions = unhashedCount > 0 || uploadActionCount > 0 || hashedCount > 0;
  const toolsBadgeCount = unhashedCount + uploadActionCount;

  // --- Gallery onOpen wrapper ---
  const handleOpen = useCallback(
    (asset: LocalAssetModel, resolvedPreviewUrl?: string) => {
      const viewerItems = showDrilledView ? drilledItems : filteredItems;
      return openAssetInViewer(asset, viewerItems, resolvedPreviewUrl);
    },
    [openAssetInViewer, filteredItems, drilledItems, showDrilledView],
  );

  // --- Group drill-down handlers ---
  const openGroup = useCallback((key: string) => {
    setDrilledGroupKey(key);
    setCurrentPage(1);
  }, [setCurrentPage]);

  const handleGroupBack = useCallback(() => {
    setDrilledGroupKey(null);
  }, []);

  // --- Empty states ---
  const filteredEmptyState = (
    <GalleryEmptyState
      icon="search"
      title="No items match current filters"
      description="Try clearing filters or broadening the search."
    />
  );
  const chooseFolderEmptyState = (
    <GalleryEmptyState
      icon="folder"
      title="Choose a folder to start"
      description="Pick a folder from the Folder filter above."
    />
  );

  // --- Render gallery (shared between flat & drilled views) ---
  const renderAssetGallery = (assets: LocalAssetModel[]) => (
    <AssetGallery
      assets={assets}
      getAssetKey={getAssetKey}
      getPreviewUrl={getPreviewUrl}
      resolvePreviewUrl={useLocalAssetPreview}
      loadPreview={controller.loadPreview}
      getMediaType={getMediaType}
      getDescription={getDescription}
      getTags={getTags}
      getCreatedAt={getCreatedAt}
      getUploadState={getUploadState}
      getHashStatus={getHashStatus}
      onOpen={handleOpen}
      onUpload={handleUpload}
      onUploadToProvider={handleUploadToProvider}
      getIsFavorite={getIsFavorite}
      onToggleFavorite={handleToggleFavorite}
      getActions={getLocalMediaCardActions}
      getMediaCardAsset={getMediaCardAsset}
      layout={layout}
      cardSize={cardSize}
      showAssetCount={!groupByFn}
      overlayPresetId={LOCAL_MEDIA_CARD_PRESET}
      initialDisplayLimit={Infinity}
      groupBy={groupByFn}
      getGroupLabel={getGroupLabel}
      sortGroupSections={groupByFn ? sortGroupSections : undefined}
      collapsibleGroups={!!groupByFn}
    />
  );

  // --- Main content ---
  const renderMainContent = () => {
    if (controller.assets.length === 0) {
      return (
        <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
          <div className="mb-4 flex justify-center">
            <svg className="w-16 h-16 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
          </div>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
            {controller.folders.length === 0 ? 'No folders added yet' : 'No files found'}
          </p>
          <p className="text-sm text-neutral-500">
            {controller.folders.length === 0
              ? 'Click "Add Folder" to get started'
              : 'Added folders contain no media files'}
          </p>
        </div>
      );
    }

    if (!hasFolderScope) {
      return chooseFolderEmptyState;
    }

    if (filteredItems.length === 0) {
      return filteredEmptyState;
    }

    // --- Group overview (folder tiles or list rows) ---
    if (showGroupOverview) {
      if (favoriteSortedGroups.length === 0) {
        return (
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
          {localGroupView === 'folders' ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
                rowGap: '12px',
                columnGap: '12px',
              }}
            >
              {pagedGroups.map((group) => {
                const compositeKey = buildFavoriteGroupKey(localGroupBy as LocalGroupBy, group.key);
                const isFav = favoriteGroupSet.has(compositeKey);
                return (
                  <div key={group.key} className="relative group/gtile">
                    <GroupFolderTile
                      group={group}
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
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteGroup(compositeKey); }}
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
                const compositeKey = buildFavoriteGroupKey(localGroupBy as LocalGroupBy, group.key);
                const isFav = favoriteGroupSet.has(compositeKey);
                return (
                  <div key={group.key} className="relative group/grow">
                    <GroupListRow
                      group={group}
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
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteGroup(compositeKey); }}
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

    // --- Drilled-in view (breadcrumb rendered separately as sticky) ---
    if (showDrilledView) {
      return drilledItems.length === 0 ? filteredEmptyState : renderAssetGallery(pageItems);
    }

    // --- Flat view (no grouping active) ---
    return renderAssetGallery(pageItems);
  };

  // Determine which pagination to show
  const showFlatPagination = !showGroupOverview && hasFolderScope && showPagination;

  return (
    <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
      {controller.assets.length > 0 && (
        <div className="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2">
          <div className="flex items-center gap-1">
            {hasFolderScope && hasToolActions && (
              <div className="relative flex-shrink-0">
                <button
                  ref={toolsBtnRef}
                  type="button"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition-colors relative"
                  title="Batch tools"
                  onClick={() => setToolsOpen((v) => !v)}
                >
                  <Icons.wrench size={14} />
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-amber-500 text-[9px] font-medium text-white flex items-center justify-center px-0.5 leading-none">
                    {toolsBadgeCount > 99 ? '99+' : toolsBadgeCount}
                  </span>
                </button>
                <Dropdown
                  isOpen={toolsOpen}
                  onClose={() => setToolsOpen(false)}
                  position="bottom-left"
                  triggerRef={toolsBtnRef}
                  minWidth="200px"
                  className="z-50"
                >
                  {unhashedCount > 0 && !controller.hashingProgress && (
                    <DropdownItem
                      icon={<Icons.hash size={12} />}
                      onClick={handleHashUnhashed}
                    >
                      Hash unhashed ({unhashedCount})
                    </DropdownItem>
                  )}
                  <DropdownItem
                    icon={<Icons.search size={12} />}
                    onClick={() => { controller.recheckBackend(); setToolsOpen(false); }}
                  >
                    Check library
                  </DropdownItem>
                  {uploadActionCount > 0 && (
                    <DropdownDivider />
                  )}
                  {uploadActionCount > 0 && (
                    <DropdownItem
                      icon={<Icons.upload size={12} />}
                      onClick={() => handleBatchUpload('library')}
                      disabled={batchUploadingRef.current}
                    >
                      Upload to library ({uploadActionCount})
                    </DropdownItem>
                  )}
                  {uploadActionCount > 0 && uploadCapableProviders.map((provider) => (
                    <DropdownItem
                      key={provider.providerId}
                      icon={<Icons.upload size={12} />}
                      onClick={() => handleBatchUpload(provider.providerId)}
                      disabled={batchUploadingRef.current}
                    >
                      Upload to {provider.name} ({uploadActionCount})
                    </DropdownItem>
                  ))}
                </Dropdown>
              </div>
            )}
            {hasFolderScope && (
              <LocalGroupingMenu
                groupBy={localGroupBy}
                groupView={localGroupView}
                groupSort={localGroupSort}
                setGroupBy={setLocalGroupBy}
                setGroupView={setLocalGroupView}
                setGroupSort={setLocalGroupSort}
              />
            )}
            <ClientFilterBar
              defs={visibleDefs}
              filterState={filterState}
              derivedOptions={derivedOptions}
              onFilterChange={setFilter}
              onReset={resetFilters}
            />
          </div>
          {/* Flat/drilled pagination */}
          {showFlatPagination && (
            <div className="mt-2">
              <PaginationStrip
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
          {/* Group overview pagination */}
          {showGroupOverview && showGroupPagination && (
            <div className="mt-2">
              <PaginationStrip
                currentPage={groupPage}
                totalPages={groupTotalPages}
                onPageChange={setGroupPage}
              />
            </div>
          )}
          {/* Group breadcrumb — inside sticky bar so it stays visible on scroll */}
          {showDrilledView && (
            <div className="mt-2">
              <LocalGroupBreadcrumb
                groupPath={[{ groupBy: localGroupBy as LocalGroupBy, groupKey: drilledGroupKey! }]}
                itemCount={drilledItems.length}
                onBack={handleGroupBack}
              />
            </div>
          )}
        </div>
      )}
      {renderMainContent()}
    </div>
  );
}
