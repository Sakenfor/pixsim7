import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icons } from '@lib/icons';

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
import { getUploadCapableProviders } from '../../lib/resolveUploadTarget';
import type { LocalAsset } from '../../stores/localFoldersStore';
import { GROUP_PAGE_SIZE } from '../groupHelpers';
import { PaginationStrip } from '../shared/PaginationStrip';

import {
  FILTER_STATE_KEY,
  LOCAL_MEDIA_CARD_PRESET,
  PAGE_KEY,
} from './constants';

export interface LocalFoldersContentProps {
  controller: LocalFoldersController;
  localFilterDefs: ClientFilterDef<LocalAsset>[];
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
  getSubfolderValue: (asset: LocalAsset) => string;
  getSubfolderLabelForAsset: (asset: LocalAsset) => string;
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

  // --- Pagination (persisted) ---
  const persistedPage = useMemo(() => {
    try { const v = localStorage.getItem(PAGE_KEY); return v ? Math.max(1, parseInt(v, 10) || 1) : 1; }
    catch { return 1; }
     
  }, []);
  const { pageItems, currentPage, totalPages, setCurrentPage, showPagination } =
    usePagedItems(filteredItems, GROUP_PAGE_SIZE, { initialPage: persistedPage });

  useEffect(() => {
    try { localStorage.setItem(PAGE_KEY, String(currentPage)); } catch { /* quota */ }
  }, [currentPage]);

  // --- Scroll to top on page change ---
  useScrollToTopOnChange(contentScrollRef, [currentPage]);

  // --- groupBy integration (always subfolder when folder scope active) ---
  const groupByFn = useMemo(() => {
    if (!hasFolderScope) return undefined;
    return (asset: LocalAsset) => getSubfolderValue(asset);
  }, [hasFolderScope, getSubfolderValue]);

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
    (groups: Array<{ key: string; label: string; count: number }>) =>
      [...groups].sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );

  // --- Tools dropdown (hash + batch upload) ---
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);

  const unhashedCount = useMemo(
    () => filteredItems.filter((a) => !a.sha256).length,
    [filteredItems],
  );

  const { pendingUploadCount, failedUploadCount } = useMemo(() => {
    let pending = 0;
    let failed = 0;
    for (const a of filteredItems) {
      const st = controller.uploadStatus[a.key] || a.last_upload_status;
      if (!st || st === 'idle') pending++;
      else if (st === 'error') failed++;
    }
    return { pendingUploadCount: pending, failedUploadCount: failed };
  }, [filteredItems, controller.uploadStatus]);

  const handleHashUnhashed = useCallback(() => {
    const folders = filterState.folder;
    if (!Array.isArray(folders)) return;
    for (const folderId of folders) {
      controller.hashFolder(folderId);
    }
    setToolsOpen(false);
  }, [controller, filterState.folder]);

  const batchUploadingRef = useRef(false);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), []);

  const handleBatchUpload = useCallback(async (target: 'library' | string) => {
    if (batchUploadingRef.current) return;
    batchUploadingRef.current = true;
    setToolsOpen(false);

    const pending = filteredItems.filter((a) => {
      const st = controller.uploadStatus[a.key] || a.last_upload_status;
      return !st || st === 'idle' || st === 'error';
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
  }, [filteredItems, controller.uploadStatus, handleUpload, handleUploadToProvider]);

  const uploadActionCount = pendingUploadCount + failedUploadCount;
  const hasToolActions = unhashedCount > 0 || uploadActionCount > 0;
  const toolsBadgeCount = unhashedCount + uploadActionCount;

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
        showAssetCount={!groupByFn}
        overlayPresetId={LOCAL_MEDIA_CARD_PRESET}
        initialDisplayLimit={Infinity}
        groupBy={groupByFn}
        getGroupLabel={getGroupLabel}
        sortGroupSections={groupByFn ? sortGroupSections : undefined}
        collapsibleGroups={!!groupByFn}
      />
    );
  };

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
                  {uploadActionCount > 0 && unhashedCount > 0 && !controller.hashingProgress && (
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
            <ClientFilterBar
              defs={visibleDefs}
              filterState={filterState}
              derivedOptions={derivedOptions}
              onFilterChange={setFilter}
              onReset={resetFilters}
            />
          </div>
          {hasFolderScope && showPagination && (
            <div className="mt-2">
              <PaginationStrip
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}
      {renderMainContent()}
    </div>
  );
}
