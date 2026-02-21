import type { RefObject } from 'react';
import { useCallback, useMemo } from 'react';

import { ClientFilterBar } from '@features/gallery/components/ClientFilterBar';
import { useClientFilterPersistence } from '@features/gallery/lib/useClientFilterPersistence';
import type { ClientFilterDef } from '@features/gallery/lib/useClientFilters';
import { useClientFilters } from '@features/gallery/lib/useClientFilters';
import { usePagedItems } from '@features/gallery/lib/usePagedItems';
import { useScrollToTopOnChange } from '@features/gallery/lib/useScrollToTopOnChange';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';


import { useLocalAssetPreview } from '../../hooks/useLocalAssetPreview';
import type { LocalAsset } from '../../stores/localFoldersStore';
import { GROUP_PAGE_SIZE } from '../groupHelpers';
import { PaginationStrip } from '../shared/PaginationStrip';

import {
  FILTER_STATE_KEY,
  GROUP_MODE_OPTIONS,
  LOCAL_MEDIA_CARD_PRESET,
  type LocalGroupMode,
} from './constants';

export interface LocalFoldersContentProps {
  controller: LocalFoldersController;
  localFilterDefs: ClientFilterDef<LocalAsset>[];
  groupMode: LocalGroupMode;
  selectGroupMode: (next: LocalGroupMode) => void;
  favoriteFoldersSet: ReadonlySet<string>;
  layout: 'masonry' | 'grid';
  cardSize: number;
  contentScrollRef: RefObject<HTMLDivElement | null>;
  // Callbacks from useLocalFolderCallbacks
  getAssetKey: (asset: LocalAsset) => string;
  getPreviewUrl: (asset: LocalAsset) => string | undefined;
  getMediaType: (asset: LocalAsset) => 'video' | 'image';
  getDescription: (asset: LocalAsset) => string;
  getTags: (asset: LocalAsset) => string[];
  getCreatedAt: (asset: LocalAsset) => string;
  getUploadState: (asset: LocalAsset) => AssetUploadState;
  getHashStatus: (asset: LocalAsset) => 'unique' | 'duplicate' | 'hashing' | undefined;
  openAssetInViewer: (asset: LocalAsset, viewerItems: LocalAsset[], resolvedPreviewUrl?: string) => Promise<void>;
  handleUpload: (asset: LocalAsset) => void;
  handleUploadToProvider: (asset: LocalAsset, providerId: string) => Promise<void>;
  getIsFavorite: (asset: LocalAsset) => boolean;
  handleToggleFavorite: (asset: LocalAsset) => Promise<void>;
  getLocalMediaCardActions: (asset: LocalAsset) => MediaCardActions;
  // Grouping helpers
  getFolderLabel: (folderId: string) => string;
  getSubfolderValue: (asset: LocalAsset) => string;
  getSubfolderLabelForAsset: (asset: LocalAsset) => string;
  isAssetInFavoriteFolder: (asset: LocalAsset) => boolean;
}

export function LocalFoldersContent({
  controller,
  localFilterDefs,
  groupMode,
  selectGroupMode,
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
  getFolderLabel,
  getSubfolderValue,
  getSubfolderLabelForAsset,
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

  // --- Pagination ---
  const { pageItems, currentPage, totalPages, setCurrentPage, showPagination } =
    usePagedItems(filteredItems, GROUP_PAGE_SIZE);

  // --- Scroll to top on page change ---
  useScrollToTopOnChange(contentScrollRef, [currentPage]);

  // --- groupBy integration ---
  const groupByFn = useMemo(() => {
    if (groupMode === 'none') return undefined;
    if (groupMode === 'folder') return (asset: LocalAsset) => asset.folderId;
    return (asset: LocalAsset) => getSubfolderValue(asset);
  }, [groupMode, getSubfolderValue]);

  // Build a label map from pageItems so getGroupLabel can resolve keys
  const groupLabelMap = useMemo(() => {
    if (!groupByFn) return undefined;
    const map = new Map<string, string>();
    for (const asset of pageItems) {
      const key = groupByFn(asset);
      if (!map.has(key)) {
        map.set(
          key,
          groupMode === 'folder'
            ? getFolderLabel(asset.folderId)
            : getSubfolderLabelForAsset(asset),
        );
      }
    }
    return map;
  }, [groupByFn, pageItems, groupMode, getFolderLabel, getSubfolderLabelForAsset]);

  const getGroupLabel = useCallback(
    (key: string) => groupLabelMap?.get(key) ?? key,
    [groupLabelMap],
  );

  const sortGroupSections = useCallback(
    (groups: Array<{ key: string; label: string; count: number }>) =>
      [...groups].sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  // --- Gallery onOpen wrapper ---
  const handleOpen = useCallback(
    (asset: LocalAsset, resolvedPreviewUrl?: string) =>
      openAssetInViewer(asset, filteredItems, resolvedPreviewUrl),
    [openAssetInViewer, filteredItems],
  );

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

    return (
      <AssetGallery
        assets={pageItems}
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
        layout={layout}
        cardSize={cardSize}
        showAssetCount={groupMode === 'none'}
        overlayPresetId={LOCAL_MEDIA_CARD_PRESET}
        initialDisplayLimit={Infinity}
        groupBy={groupByFn}
        getGroupLabel={getGroupLabel}
        sortGroupSections={groupMode !== 'none' ? sortGroupSections : undefined}
      />
    );
  };

  return (
    <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
      {controller.assets.length > 0 && (
        <div className="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2">
          <ClientFilterBar
            defs={visibleDefs}
            filterState={filterState}
            derivedOptions={derivedOptions}
            onFilterChange={setFilter}
            onReset={resetFilters}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/70 p-0.5">
              {GROUP_MODE_OPTIONS.map((option) => {
                const isActive = groupMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectGroupMode(option.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-text'
                        : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {groupMode !== 'none' && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Grouped by {groupMode === 'folder' ? 'folder' : 'subfolder'}
                </span>
              )}
              {hasFolderScope && showPagination && (
                <PaginationStrip
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {renderMainContent()}
    </div>
  );
}
