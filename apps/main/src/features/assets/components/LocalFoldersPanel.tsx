import { DropdownDivider, DropdownItem, Popover } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';


import { Icons } from '@lib/icons';

import type { ClientFilterState } from '@features/gallery/lib/useClientFilters';

import type { LocalFoldersController } from '@/types/localSources';

import { useAssetViewer } from '../hooks/useAssetViewer';
import { useAssetViewerStore, selectIsViewerOpen } from '../stores/assetViewerStore';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import type { LocalAssetModel } from '../types/localFolderMeta';

import {
  ALL_ASSETS_SCROLL_SCOPE,
  type ContentScrollByScope,
} from './localFolders/constants';
import { buildLocalFilterDefs } from './localFolders/filterDefs';
import { LocalFoldersContent } from './localFolders/LocalFoldersContent';
import { LocalIngestionToolbar } from './localFolders/LocalIngestionToolbar';
import {
  readStoredContentScrollByScope,
  writeStoredContentScrollByScope,
} from './localFolders/persistence';
import { useLocalFolderCallbacks } from './localFolders/useLocalFolderCallbacks';
import {
  getDirectoryFromRelativePath,
  makeSubfolderValue,
  parseSubfolderValue,
} from './localFolders/utils';

interface LocalFoldersPanelProps {
  controller: LocalFoldersController;
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

export function LocalFoldersPanel({ controller, layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const favoriteFoldersArr = useLocalFolderSettingsStore((s) => s.favoriteFolders);
  const toggleFavoriteFolder = useLocalFolderSettingsStore((s) => s.toggleFavoriteFolder);
  const favoriteFoldersSet = useMemo(() => new Set(favoriteFoldersArr), [favoriteFoldersArr]);
  const favoriteRootFolderIds = useMemo(() => {
    const roots = new Set<string>();
    for (const path of favoriteFoldersArr) {
      const root = path.split('/')[0];
      if (root) roots.add(root);
    }
    return roots;
  }, [favoriteFoldersArr]);

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollByScopeRef = useRef<ContentScrollByScope | null>(null);

  const [managedFolderId, setManagedFolderId] = useState<string | null>(null);
  const manageFolderAnchorRef = useRef<HTMLButtonElement | null>(null);

  // --- Folder name / favorites / subfolder derivations ---
  const folderNames = useMemo(() => {
    return controller.folders.reduce((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {} as Record<string, string>);
  }, [controller.folders]);

  const getFolderLabel = useCallback((folderId: string) => {
    return folderNames[folderId] || folderId;
  }, [folderNames]);
  const isFavoriteRootFolder = useCallback((folderId: string) => (
    favoriteRootFolderIds.has(folderId)
  ), [favoriteRootFolderIds]);
  const getFolderFilterLabel = useCallback((folderId: string) => {
    return getFolderLabel(folderId);
  }, [getFolderLabel]);
  const isAssetInFavoriteFolder = useCallback((asset: LocalAssetModel) => {
    if (favoriteFoldersSet.size === 0) return false;
    if (favoriteFoldersSet.has(asset.folderId)) return true;

    const directory = getDirectoryFromRelativePath(asset.relativePath);
    if (!directory) return false;

    const parts = directory.split('/');
    let candidatePath = asset.folderId;
    for (const part of parts) {
      candidatePath = `${candidatePath}/${part}`;
      if (favoriteFoldersSet.has(candidatePath)) {
        return true;
      }
    }
    return false;
  }, [favoriteFoldersSet]);
  const getSubfolderValue = useCallback((asset: LocalAssetModel) => {
    return makeSubfolderValue(asset.folderId, getDirectoryFromRelativePath(asset.relativePath));
  }, []);
  const getSubfolderLabelFromValue = useCallback((value: string) => {
    const parsed = parseSubfolderValue(value);
    if (!parsed) return value;
    return parsed.directory || '(root)';
  }, []);
  const getSubfolderLabelForAsset = useCallback((asset: LocalAssetModel) => {
    return getSubfolderLabelFromValue(getSubfolderValue(asset));
  }, [getSubfolderLabelFromValue, getSubfolderValue]);
  const getScopedFolderIds = useCallback((filterState: ClientFilterState): string[] => {
    const selectedFolders = filterState.folder;
    const favoritesSelection = filterState.favorites;
    const favoriteFoldersOnly = Array.isArray(favoritesSelection) && favoritesSelection.includes('folders');
    if (Array.isArray(selectedFolders) && selectedFolders.length > 0) {
      const scoped = selectedFolders
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
      return favoriteFoldersOnly
        ? scoped.filter((folderId) => favoriteRootFolderIds.has(folderId))
        : scoped;
    }

    return [];
  }, [favoriteRootFolderIds]);

  const localMetadataResolver = useCallback(
    (asset: LocalAssetModel) => ({
      folderName: folderNames[asset.folderId],
      assetId:
        typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
          ? asset.last_upload_asset_id
          : undefined,
      providerId: controller.providerId,
    }),
    [folderNames, controller.providerId]
  );
  const { openLocalAsset: openLocalAssetModel, localAssetToViewer } = useAssetViewer({
    source: 'local',
    localMetadataResolver,
  });
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);

  // Scope sync is handled inside LocalFoldersContent to respect drill-down state

  const contentScrollScope = ALL_ASSETS_SCROLL_SCOPE;

  // --- Callbacks hook ---
  const callbacks = useLocalFolderCallbacks({
    controller,
    openLocalAssetModel,
  });

  const closeManageFolderMenu = useCallback(() => {
    setManagedFolderId(null);
    manageFolderAnchorRef.current = null;
  }, []);

  const openManageFolderMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    manageFolderAnchorRef.current = event.currentTarget;
    setManagedFolderId(folderId);
  }, []);

  const managedFolderName = managedFolderId ? (folderNames[managedFolderId] || managedFolderId) : null;

  useEffect(() => {
    if (!managedFolderId) return;
    if (controller.folders.some((folder) => folder.id === managedFolderId)) return;
    closeManageFolderMenu();
  }, [managedFolderId, controller.folders, closeManageFolderMenu]);

  // --- Per-option action buttons for folder / subfolder filters ---
  const renderFolderOptionExtra = useCallback((folderId: string): ReactNode => {
    const isFav = favoriteFoldersSet.has(folderId);
    return (
      <>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          title="Hash files"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); controller.hashFolder(folderId); }}
        >
          <Icons.hash size={12} />
        </button>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          title="Check library for matches"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); controller.recheckBackend(); }}
        >
          <Icons.search size={12} />
        </button>
        <button
          type="button"
          className={`p-0.5 rounded transition-colors ${
            isFav
              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
              : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-amber-500'
          }`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavoriteFolder(folderId); }}
        >
          <Icons.star size={12} />
        </button>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          title="Manage folder"
          onClick={(e) => openManageFolderMenu(e, folderId)}
        >
          <Icons.settings size={12} />
        </button>
      </>
    );
  }, [controller, favoriteFoldersSet, toggleFavoriteFolder, openManageFolderMenu]);

  const renderSubfolderOptionExtra = useCallback((subfolderValue: string): ReactNode => {
    const parsed = parseSubfolderValue(subfolderValue);
    if (!parsed) return null;
    const favPath = parsed.directory ? `${parsed.folderId}/${parsed.directory}` : parsed.folderId;
    const isFav = favoriteFoldersSet.has(favPath);
    return (
      <>
        <button
          type="button"
          className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          title="Hash files"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); controller.hashFolder(parsed.folderId); }}
        >
          <Icons.hash size={12} />
        </button>
        <button
          type="button"
          className={`p-0.5 rounded transition-colors ${
            isFav
              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
              : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-amber-500'
          }`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavoriteFolder(favPath); }}
        >
          <Icons.star size={12} />
        </button>
      </>
    );
  }, [controller, favoriteFoldersSet, toggleFavoriteFolder]);

  // --- Filter definitions ---
  const localFilterDefs = useMemo(() => buildLocalFilterDefs({
    getFolderLabel,
    getFolderFilterLabel,
    isFavoriteRootFolder,
    isAssetInFavoriteFolder,
    getScopedFolderIds,
    getSubfolderValue,
    getSubfolderLabelForAsset,
    getUploadFilterState: callbacks.getUploadFilterState,
    getHashFilterState: callbacks.getHashFilterState,
    favoriteStatus: controller.favoriteStatus,
    renderFolderOptionExtra,
    renderSubfolderOptionExtra,
  }), [
    controller.favoriteStatus,
    getFolderFilterLabel,
    getFolderLabel,
    callbacks.getHashFilterState,
    getScopedFolderIds,
    isAssetInFavoriteFolder,
    isFavoriteRootFolder,
    getSubfolderLabelForAsset,
    getSubfolderValue,
    callbacks.getUploadFilterState,
    renderFolderOptionExtra,
    renderSubfolderOptionExtra,
  ]);

  // --- Scroll persistence ---
  const getContentScrollByScope = useCallback((): ContentScrollByScope => {
    if (!contentScrollByScopeRef.current) {
      contentScrollByScopeRef.current = readStoredContentScrollByScope();
    }
    return contentScrollByScopeRef.current;
  }, []);

  const persistContentScroll = useCallback((scope: string, scrollTop: number) => {
    const map = getContentScrollByScope();
    const nextScrollTop = Math.max(0, Math.round(scrollTop));
    if ((map[scope] || 0) === nextScrollTop) return;
    map[scope] = nextScrollTop;
    writeStoredContentScrollByScope(map);
  }, [getContentScrollByScope]);

  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;

    const savedByScope = getContentScrollByScope();
    const saved = savedByScope[contentScrollScope] || 0;

    const restore = () => {
      if (saved <= 0) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(saved, maxScroll);
    };

    const restoreTimers: Array<ReturnType<typeof setTimeout>> = [
      setTimeout(restore, 0),
      setTimeout(restore, 120),
      setTimeout(restore, 300),
    ];

    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      persistContentScroll(contentScrollScope, el.scrollTop);
    };
    const onScroll = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persistTimer = setTimeout(persist, 120);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      restoreTimers.forEach(clearTimeout);
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persist();
      el.removeEventListener('scroll', onScroll);
    };
  }, [contentScrollScope, controller.assets.length, getContentScrollByScope, persistContentScroll]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <LocalIngestionToolbar controller={controller} />

      {managedFolderId && (
          <Popover
            open={!!managedFolderId}
            onClose={closeManageFolderMenu}
            anchor={manageFolderAnchorRef.current}
            placement="bottom"
            align="start"
            offset={4}
            className="min-w-[210px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
          >
            <DropdownItem disabled icon={<Icons.folder size={12} />}>
              {managedFolderName ?? managedFolderId}
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              icon={<Icons.refreshCw size={12} />}
              onClick={() => {
                controller.refreshFolder(managedFolderId);
                closeManageFolderMenu();
              }}
            >
              Refresh
            </DropdownItem>
            <DropdownItem
              icon={<Icons.hash size={12} />}
              onClick={() => {
                controller.hashFolder(managedFolderId);
                closeManageFolderMenu();
              }}
            >
              Hash Files
            </DropdownItem>
            <DropdownItem
              icon={<Icons.search size={12} />}
              onClick={() => {
                controller.recheckBackend();
                closeManageFolderMenu();
              }}
            >
              Check Library
            </DropdownItem>
            <DropdownItem
              icon={<Icons.star size={12} />}
              onClick={() => {
                toggleFavoriteFolder(managedFolderId);
                closeManageFolderMenu();
              }}
            >
              {favoriteFoldersSet.has(managedFolderId) ? 'Remove Favorite' : 'Add Favorite'}
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              icon={<Icons.trash size={12} />}
              variant="danger"
              onClick={() => {
                controller.removeFolder(managedFolderId);
                closeManageFolderMenu();
              }}
            >
              Remove Folder
            </DropdownItem>
          </Popover>
        )}

      <div className="flex-1 min-h-0 flex flex-col px-6">
        {/* Main content */}
        <LocalFoldersContent
          controller={controller}
          localFilterDefs={localFilterDefs}
          favoriteFoldersSet={favoriteFoldersSet}
          layout={layout}
          cardSize={cardSize}
          contentScrollRef={contentScrollRef}
          getAssetKey={callbacks.getAssetKey}
          getPreviewUrl={callbacks.getPreviewUrl}
          getMediaType={callbacks.getMediaType}
          getDescription={callbacks.getDescription}
          getTags={callbacks.getTags}
          getCreatedAt={callbacks.getCreatedAt}
          getUploadState={callbacks.getUploadState}
          getHashStatus={callbacks.getHashStatus}
          openAssetInViewer={callbacks.openAssetInViewer}
          handleUpload={callbacks.handleUpload}
          handleUploadToProvider={callbacks.handleUploadToProvider}
          getIsFavorite={callbacks.getIsFavorite}
          handleToggleFavorite={callbacks.handleToggleFavorite}
          getLocalMediaCardActions={callbacks.getLocalMediaCardActions}
          toGenerationInputAsset={callbacks.toGenerationInputAsset}
          getSubfolderValue={getSubfolderValue}
          getSubfolderLabelForAsset={getSubfolderLabelForAsset}
          localAssetToViewer={localAssetToViewer}
          isViewerOpen={isViewerOpen}
        />
      </div>
    </div>
  );
}
