import type { RefObject } from 'react';
import { useCallback } from 'react';

import { Icons } from '@lib/icons';

import type { ClientFilterDef } from '@features/gallery/lib/useClientFilters';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';

import { useLocalAssetPreview } from '../../hooks/useLocalAssetPreview';
import type { LocalAsset } from '../../stores/localFoldersStore';
import { ClientFilteredGallerySection } from '../shared/ClientFilteredGallerySection';

import {
  GROUP_MODE_OPTIONS,
  LOCAL_MEDIA_CARD_PRESET,
  type LocalGroupMode,
} from './constants';
import { isAssetInFolderScope } from './utils';

export interface LocalFoldersContentProps {
  controller: LocalFoldersController;
  displayAssets: LocalAsset[];
  localFilterDefs: ClientFilterDef<LocalAsset>[];
  groupMode: LocalGroupMode;
  selectGroupMode: (next: LocalGroupMode) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
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
  displayAssets,
  localFilterDefs,
  groupMode,
  selectGroupMode,
  isSidebarCollapsed,
  toggleSidebar,
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
  getIsFavorite,
  handleToggleFavorite,
  getLocalMediaCardActions,
  getFolderLabel,
  getSubfolderValue,
  getSubfolderLabelForAsset,
}: LocalFoldersContentProps) {
  const renderAssetGallery = useCallback(
    (
      galleryAssets: LocalAsset[],
      viewerItems: LocalAsset[],
      showAssetCount: boolean,
    ) => (
      <AssetGallery
        assets={galleryAssets}
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
        onOpen={(asset, resolvedPreviewUrl) =>
          openAssetInViewer(asset, viewerItems, resolvedPreviewUrl)
        }
        onUpload={handleUpload}
        getIsFavorite={getIsFavorite}
        onToggleFavorite={handleToggleFavorite}
        getActions={getLocalMediaCardActions}
        layout={layout}
        cardSize={cardSize}
        showAssetCount={showAssetCount}
        overlayPresetId={LOCAL_MEDIA_CARD_PRESET}
      />
    ),
    [
      cardSize,
      controller.loadPreview,
      getAssetKey,
      getCreatedAt,
      getDescription,
      getHashStatus,
      getIsFavorite,
      getMediaType,
      getPreviewUrl,
      getTags,
      getUploadState,
      handleToggleFavorite,
      handleUpload,
      getLocalMediaCardActions,
      layout,
      openAssetInViewer,
    ],
  );

  const buildGroupedAssets = useCallback((items: LocalAsset[]) => {
    const groups = new Map<string, { label: string; assets: LocalAsset[] }>();

    for (const asset of items) {
      const groupKey = groupMode === 'folder'
        ? asset.folderId
        : getSubfolderValue(asset);
      const groupLabel = groupMode === 'folder'
        ? getFolderLabel(asset.folderId)
        : getSubfolderLabelForAsset(asset);
      const existing = groups.get(groupKey);
      if (existing) {
        existing.assets.push(asset);
        continue;
      }
      groups.set(groupKey, { label: groupLabel, assets: [asset] });
    }

    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, label: value.label, assets: value.assets }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [getFolderLabel, getSubfolderLabelForAsset, getSubfolderValue, groupMode]);

  // Empty states
  const noFoldersEmptyState = (
    <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
      <div className="mb-4 flex justify-center">
        <Icons.folder size={64} className="text-neutral-400" />
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

  const folderEmptyState = (
    <GalleryEmptyState
      icon="folder"
      title="No files in this folder"
    />
  );
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
      description="Pick a folder in filters or open the folders sidebar."
    />
  );

  const renderMainContent = (galleryAssets: LocalAsset[]) => {
    if (controller.assets.length === 0) {
      return noFoldersEmptyState;
    }

    if (controller.selectedFolderPath && displayAssets.length === 0) {
      return folderEmptyState;
    }

    if (galleryAssets.length === 0) {
      return filteredEmptyState;
    }

    if (groupMode === 'none') {
      return renderAssetGallery(galleryAssets, galleryAssets, true);
    }

    const groupedAssets = buildGroupedAssets(galleryAssets);
    return (
      <div className="space-y-5">
        {groupedAssets.map((group) => (
          <section key={group.key} className="space-y-2">
            <header className="flex items-center justify-between pb-1 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 truncate pr-3">
                {group.label}
              </h3>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                {group.assets.length.toLocaleString()} items
              </span>
            </header>
            {renderAssetGallery(group.assets, galleryAssets, false)}
          </section>
        ))}
      </div>
    );
  };

  return (
    <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
      {isSidebarCollapsed && (
        <div className="mb-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Icons.folderTree size={14} />
            Show folders sidebar
          </button>
        </div>
      )}
      <ClientFilteredGallerySection<LocalAsset>
        items={controller.assets}
        filterDefs={localFilterDefs}
        toolbarClassName="sticky top-0 z-20 mb-3 border-b border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/95 dark:bg-neutral-950/95 supports-[backdrop-filter]:bg-neutral-50/80 supports-[backdrop-filter]:dark:bg-neutral-950/80 backdrop-blur pb-2"
        renderToolbarExtra={() => (
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
            {groupMode !== 'none' && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Grouped by {groupMode === 'folder' ? 'folder' : 'subfolder'}
              </span>
            )}
          </div>
        )}
      >
        {(filteredDisplayAssets, { filterState }) => {
          const folderSelection = filterState.folder;
          const hasFolderFilterSelection = Array.isArray(folderSelection) && folderSelection.length > 0;
          const hasFavoriteFolderScope = filterState.favorite_folders === true && favoriteFoldersSet.size > 0;
          const hasFolderScope =
            !!controller.selectedFolderPath || hasFolderFilterSelection || hasFavoriteFolderScope;

          if (controller.assets.length > 0 && !hasFolderScope) {
            return chooseFolderEmptyState;
          }

          const scopedFilteredAssets = controller.selectedFolderPath
            ? filteredDisplayAssets.filter((asset) =>
                isAssetInFolderScope(asset, controller.selectedFolderPath || ''))
            : filteredDisplayAssets;
          return renderMainContent(scopedFilteredAssets);
        }}
      </ClientFilteredGallerySection>
    </div>
  );
}
