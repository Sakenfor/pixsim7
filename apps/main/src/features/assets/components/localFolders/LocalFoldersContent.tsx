/**
 * LocalFoldersContent — thin local-folders wrapper over the generic
 * SourceGalleryView.
 *
 * All the filter/group/drill/paginate/viewer orchestration now lives in
 * SourceGalleryView; this wrapper only injects local-specific config: the
 * group-dimension functions, the grouping menu / breadcrumb / batch-tools
 * chrome, the card-asset adapter, the local empty state, and the persisted
 * group settings. Props are unchanged so LocalFoldersPanel is untouched.
 */

import type { RefObject } from 'react';
import { useCallback, useMemo } from 'react';

import { Icons } from '@lib/icons';

import { SourceGalleryView } from '@features/gallery/components/SourceGalleryView';
import type { ClientFilterDef, ClientFilterState } from '@features/gallery/lib/useClientFilters';


import type { AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';

import { useLocalAssetPreview } from '../../hooks/useLocalAssetPreview';
import {
  buildFavoriteGroupKey,
  bucketLocalAssetModels,
  getLocalGroupLabel,
  localAssetToPreviewShim,
  type LocalGroupBy,
} from '../../lib/localGroupEngine';
import type { AssetModel } from '../../models/asset';
import { localFolderSource } from '../../sources/localFolderSource';
import { useClientLoadedAssets } from '../../sources/useClientLoadedAssets';
import type { ViewerAsset } from '../../stores/assetViewerStore';
import { useLocalFolderSettingsStore } from '../../stores/localFolderSettingsStore';
import type { LocalAssetModel } from '../../types/localFolderMeta';

import {
  DRILLED_GROUP_KEY,
  FILTER_STATE_KEY,
  LOCAL_MEDIA_CARD_PRESET,
  PAGE_KEY,
} from './constants';
import { LocalBatchToolsButton } from './LocalBatchToolsButton';
import { LocalGroupBreadcrumb } from './LocalGroupBreadcrumb';
import { LocalGroupingMenu } from './LocalGroupingMenu';
import { useLocalFolderCardAssetAdapter } from './useLocalFolderCardAssetAdapter';

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
  // Source assets through the AssetSource adapter (reactive read). The controller
  // still owns hydration (with userId-gated loadPersisted), so opt out of the
  // bridge's own load to avoid a second, ungated load. Equivalent array to
  // controller.assets — both read the same zustand store.
  const localAssets = useClientLoadedAssets<LocalAssetModel>(localFolderSource, { autoLoad: false });

  // --- Group settings from persisted store ---
  const localGroupBy = useLocalFolderSettingsStore((s) => s.localGroupBy);
  const localGroupView = useLocalFolderSettingsStore((s) => s.localGroupView);
  const localGroupSort = useLocalFolderSettingsStore((s) => s.localGroupSort);
  const setLocalGroupBy = useLocalFolderSettingsStore((s) => s.setLocalGroupBy);
  const setLocalGroupView = useLocalFolderSettingsStore((s) => s.setLocalGroupView);
  const setLocalGroupSort = useLocalFolderSettingsStore((s) => s.setLocalGroupSort);
  const favoriteGroups = useLocalFolderSettingsStore((s) => s.favoriteGroups);
  const toggleFavoriteGroup = useLocalFolderSettingsStore((s) => s.toggleFavoriteGroup);

  const favoriteGroupKeys = useMemo(() => new Set(favoriteGroups), [favoriteGroups]);

  // Folder scope: a folder filter is selected, or favorites→folders with pins.
  const computeHasScope = useCallback((filterState: ClientFilterState) => {
    const folderSel = filterState.folder;
    const hasFolderFilter = Array.isArray(folderSel) && folderSel.length > 0;
    const favSel = filterState.favorites;
    const hasFavFolderScope = Array.isArray(favSel) && favSel.includes('folders') && favoriteFoldersSet.size > 0;
    return hasFolderFilter || hasFavFolderScope;
  }, [favoriteFoldersSet]);

  // Local card adapter (links uploaded local files to canonical library assets).
  // use-prefixed so it is recognized as a custom hook; called by SourceGalleryView.
  const useCardAssetAdapter = (visibleAssets: LocalAssetModel[]) =>
    useLocalFolderCardAssetAdapter({ visibleAssets, toFallbackAsset: toGenerationInputAsset });

  const groupingMenuSlot = (
    <LocalGroupingMenu
      groupBy={localGroupBy}
      groupView={localGroupView}
      groupSort={localGroupSort}
      setGroupBy={setLocalGroupBy}
      setGroupView={setLocalGroupView}
      setGroupSort={setLocalGroupSort}
    />
  );

  const renderToolbar = useCallback(
    (ctx: { filteredItems: LocalAssetModel[]; pageItems: LocalAssetModel[]; drilledItems: LocalAssetModel[]; showDrilledView: boolean }) => (
      <LocalBatchToolsButton
        visibleItems={ctx.showDrilledView ? ctx.drilledItems : ctx.filteredItems}
        pageItems={ctx.pageItems}
        uploadStatus={controller.uploadStatus}
        hashingProgress={controller.hashingProgress}
        hashingPaused={controller.hashingPaused}
        hashAssets={controller.hashAssets}
        recheckBackend={controller.recheckBackend}
        onUpload={handleUpload}
        onUploadToProvider={handleUploadToProvider}
      />
    ),
    [controller.uploadStatus, controller.hashingProgress, controller.hashingPaused, controller.hashAssets, controller.recheckBackend, handleUpload, handleUploadToProvider],
  );

  const renderBreadcrumb = useCallback(
    (ctx: { groupBy: LocalGroupBy; groupKey: string; itemCount: number; onBack: () => void }) => (
      <LocalGroupBreadcrumb
        groupPath={[{ groupBy: ctx.groupBy, groupKey: ctx.groupKey }]}
        itemCount={ctx.itemCount}
        onBack={ctx.onBack}
      />
    ),
    [],
  );

  const addFolderDisabled = controller.adding || controller.scanning !== null || !controller.supported;

  // Compact Add Folder control for the gallery toolbar row (replaces the old
  // "Local Folders" header row). Lives in the always-rendered leadingToolbarSlot
  // so it stays reachable in the scope-less folder overview.
  const addFolderButton = (
    <button
      type="button"
      className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-accent text-accent-text hover:bg-accent-hover disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors text-xs font-medium flex-shrink-0"
      onClick={controller.addFolder}
      disabled={addFolderDisabled}
      title="Add a local folder"
    >
      <Icons.folderOpen size={14} />
      {controller.adding ? 'Adding...' : 'Add Folder'}
    </button>
  );

  const emptyState = (
    <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
      <div className="mb-4 flex justify-center">
        <svg className="w-16 h-16 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
      </div>
      <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
        {controller.folders.length === 0 ? 'No folders added yet' : 'No files found'}
      </p>
      <p className="text-sm text-neutral-500 mb-4">
        {controller.folders.length === 0
          ? 'Add a folder to get started'
          : 'Added folders contain no media files'}
      </p>
      {controller.folders.length === 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-accent-text hover:bg-accent-hover disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            onClick={controller.addFolder}
            disabled={addFolderDisabled}
          >
            <Icons.folderOpen size={14} />
            {controller.adding ? 'Adding...' : 'Add Folder'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <SourceGalleryView<LocalAssetModel, LocalGroupBy>
      assets={localAssets}
      getAssetKey={getAssetKey}
      filterDefs={localFilterDefs}
      filterStorageKey={FILTER_STATE_KEY}
      computeHasScope={computeHasScope}
      groupBy={localGroupBy}
      groupView={localGroupView}
      groupSort={localGroupSort}
      forcedGroupByWhenNoScope={'folder' as LocalGroupBy}
      bucketAssets={bucketLocalAssetModels}
      getGroupLabel={getLocalGroupLabel}
      toPreviewShim={localAssetToPreviewShim}
      buildFavoriteGroupKey={buildFavoriteGroupKey}
      favoriteGroupKeys={favoriteGroupKeys}
      onToggleFavoriteGroup={toggleFavoriteGroup}
      inlineGroupBy={getSubfolderValue}
      inlineGroupLabelForAsset={getSubfolderLabelForAsset}
      getPreviewUrl={getPreviewUrl}
      resolvePreviewUrl={useLocalAssetPreview}
      getMediaType={getMediaType}
      getDescription={getDescription}
      getTags={getTags}
      getCreatedAt={getCreatedAt}
      getUploadState={getUploadState}
      getHashStatus={getHashStatus}
      getIsFavorite={getIsFavorite}
      getActions={getLocalMediaCardActions}
      onUpload={handleUpload}
      onUploadToProvider={handleUploadToProvider}
      onToggleFavorite={handleToggleFavorite}
      overlayPresetId={LOCAL_MEDIA_CARD_PRESET}
      useCardAssetAdapter={useCardAssetAdapter}
      loadPreview={controller.loadPreview}
      cancelPendingPreviews={controller.cancelPendingPreviews}
      viewerScopeId="local"
      viewerScopeLabel="Local"
      isViewerOpen={isViewerOpen}
      assetToViewer={localAssetToViewer}
      viewerPreviewMap={controller.previews}
      onOpen={openAssetInViewer}
      onActiveAssetScopeChange={controller.setActiveAssetScope}
      layout={layout}
      cardSize={cardSize}
      scrollRef={contentScrollRef}
      pageStorageKey={PAGE_KEY}
      drilledGroupStorageKey={DRILLED_GROUP_KEY}
      scopeResetDeps={[controller.selectedFolderPath, controller.viewMode]}
      groupingMenuSlot={groupingMenuSlot}
      leadingToolbarSlot={addFolderButton}
      renderToolbar={renderToolbar}
      renderBreadcrumb={renderBreadcrumb}
      emptyState={emptyState}
    />
  );
}
