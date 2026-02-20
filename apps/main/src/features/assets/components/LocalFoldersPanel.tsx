import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icons } from '@lib/icons';

import type { ClientFilterState } from '@features/gallery/lib/useClientFilters';
import { useProviders } from '@features/providers';

import type { LocalFoldersController } from '@/types/localSources';

import { useAssetViewer } from '../hooks/useAssetViewer';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import type { LocalAsset } from '../stores/localFoldersStore';

import {
  ALL_ASSETS_SCROLL_SCOPE,
  FOLDER_TREE_SCROLL_KEY,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_SCROLL_KEY,
  type ContentScrollByScope,
  type LocalGroupMode,
} from './localFolders/constants';
import { buildLocalFilterDefs } from './localFolders/filterDefs';
import { LocalFoldersContent } from './localFolders/LocalFoldersContent';
import { LocalFoldersSidebar } from './localFolders/LocalFoldersSidebar';
import {
  readStoredBoolean,
  readStoredContentScrollByScope,
  readStoredGroupMode,
  readStoredScrollTop,
  writeStoredBoolean,
  writeStoredContentScrollByScope,
  writeStoredGroupMode,
  writeStoredScrollTop,
} from './localFolders/persistence';
import { useLocalFolderCallbacks } from './localFolders/useLocalFolderCallbacks';
import {
  formatBytes,
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
  const { providers } = useProviders();
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

  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const folderTreeScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollByScopeRef = useRef<ContentScrollByScope | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    readStoredBoolean(SIDEBAR_COLLAPSED_KEY, false),
  );
  const [groupMode, setGroupMode] = useState<LocalGroupMode>(() => readStoredGroupMode());

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      writeStoredBoolean(SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);
  const selectGroupMode = useCallback((next: LocalGroupMode) => {
    setGroupMode(next);
    writeStoredGroupMode(next);
  }, []);

  // --- Folder name / favorites / subfolder derivations (shared between sidebar + content) ---
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
  const isAssetInFavoriteFolder = useCallback((asset: LocalAsset) => {
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
  const getSubfolderValue = useCallback((asset: LocalAsset) => {
    return makeSubfolderValue(asset.folderId, getDirectoryFromRelativePath(asset.relativePath));
  }, []);
  const getSubfolderLabelFromValue = useCallback((value: string) => {
    const parsed = parseSubfolderValue(value);
    if (!parsed) return value;
    const folderLabel = getFolderLabel(parsed.folderId);
    return parsed.directory ? `${folderLabel}/${parsed.directory}` : `${folderLabel}/(root)`;
  }, [getFolderLabel]);
  const getSubfolderLabelForAsset = useCallback((asset: LocalAsset) => {
    return getSubfolderLabelFromValue(getSubfolderValue(asset));
  }, [getSubfolderLabelFromValue, getSubfolderValue]);
  const getScopedFolderIds = useCallback((filterState: ClientFilterState): string[] => {
    const selectedFolders = filterState.folder;
    const favoriteFoldersOnly = filterState.favorite_folders === true;
    if (Array.isArray(selectedFolders) && selectedFolders.length > 0) {
      const scoped = selectedFolders
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
      return favoriteFoldersOnly
        ? scoped.filter((folderId) => favoriteRootFolderIds.has(folderId))
        : scoped;
    }

    if (controller.selectedFolderPath) {
      const rootFolderId = controller.selectedFolderPath.split('/')[0];
      if (!rootFolderId) return [];
      if (favoriteFoldersOnly && !favoriteRootFolderIds.has(rootFolderId)) {
        return [];
      }
      return [rootFolderId];
    }

    return [];
  }, [controller.selectedFolderPath, favoriteRootFolderIds]);

  const localMetadataResolver = useCallback(
    (asset: LocalAsset) => ({
      folderName: folderNames[asset.folderId],
      providerId: controller.providerId,
    }),
    [folderNames, controller.providerId]
  );
  const { openLocalAsset } = useAssetViewer({
    source: 'local',
    localMetadataResolver,
  });

  // Determine which assets to show based on folder selection
  const displayAssets = useMemo(() => {
    if (controller.selectedFolderPath) {
      return controller.filteredAssets;
    }
    return controller.assets;
  }, [controller.selectedFolderPath, controller.filteredAssets, controller.assets]);

  const contentScrollScope = controller.selectedFolderPath || ALL_ASSETS_SCROLL_SCOPE;

  // --- Callbacks hook ---
  const callbacks = useLocalFolderCallbacks({
    controller,
    openLocalAsset,
    displayAssets,
  });

  // --- Hashing labels ---
  const hashingBytesLabel = useMemo(() => {
    const progress = controller.hashingProgress;
    if (!progress?.bytesTotal || progress.bytesTotal <= 0) return null;

    const bytesDone = Math.max(0, progress.bytesDone ?? 0);
    const bytesTotal = Math.max(1, progress.bytesTotal);
    const percent = Math.min(100, Math.round((bytesDone / bytesTotal) * 100));
    return `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)} (${percent}%)`;
  }, [controller.hashingProgress]);

  const hashingPhaseLabel = useMemo(() => {
    const phase = controller.hashingProgress?.phase;
    if (phase === 'digesting') return 'digesting';
    return 'reading';
  }, [controller.hashingProgress?.phase]);

  // --- Filter definitions ---
  const localFilterDefs = useMemo(() => buildLocalFilterDefs({
    getFolderLabel,
    getFolderFilterLabel,
    isFavoriteRootFolder,
    isAssetInFavoriteFolder,
    favoriteFoldersSet,
    getScopedFolderIds,
    getSubfolderValue,
    getSubfolderLabelForAsset,
    getUploadFilterState: callbacks.getUploadFilterState,
    getHashFilterState: callbacks.getHashFilterState,
    favoriteStatus: controller.favoriteStatus,
  }), [
    controller.favoriteStatus,
    favoriteFoldersSet,
    getFolderFilterLabel,
    getFolderLabel,
    callbacks.getHashFilterState,
    getScopedFolderIds,
    isAssetInFavoriteFolder,
    isFavoriteRootFolder,
    getSubfolderLabelForAsset,
    getSubfolderValue,
    callbacks.getUploadFilterState,
  ]);

  // --- Scroll persistence effects ---
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
    const el = sidebarScrollRef.current;
    if (!el) return;

    const restore = () => {
      const saved = readStoredScrollTop(SIDEBAR_SCROLL_KEY);
      if (saved <= 0) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(saved, maxScroll);
    };

    const rafId = requestAnimationFrame(restore);
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      writeStoredScrollTop(SIDEBAR_SCROLL_KEY, el.scrollTop);
    };
    const onScroll = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persistTimer = setTimeout(persist, 120);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persist();
      el.removeEventListener('scroll', onScroll);
    };
  }, [controller.folders.length, controller.missingFolderNames.length]);

  useEffect(() => {
    const el = folderTreeScrollRef.current;
    if (!el) return;

    const restore = () => {
      const saved = readStoredScrollTop(FOLDER_TREE_SCROLL_KEY);
      if (saved <= 0) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(saved, maxScroll);
    };

    const rafId = requestAnimationFrame(restore);
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    const persist = () => {
      writeStoredScrollTop(FOLDER_TREE_SCROLL_KEY, el.scrollTop);
    };
    const onScroll = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persistTimer = setTimeout(persist, 120);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      if (persistTimer) {
        clearTimeout(persistTimer);
      }
      persist();
      el.removeEventListener('scroll', onScroll);
    };
  }, [controller.folders.length, controller.missingFolderNames.length]);

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
  }, [contentScrollScope, displayAssets.length, getContentScrollByScope, persistContentScroll]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 mb-3 px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleSidebar}
              className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title={isSidebarCollapsed ? 'Show folders sidebar' : 'Hide folders sidebar'}
            >
              {isSidebarCollapsed ? 'Show Folders' : 'Hide Folders'}
            </button>
            <h2 className="text-lg font-semibold truncate">Local Folders</h2>
            {controller.selectedFolderPath && (
              <span
                className="hidden md:inline-flex items-center px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[240px]"
                title={controller.selectedFolderPath}
              >
                {controller.selectedFolderPath}
              </span>
            )}
          </div>
          <button
            type="button"
            className="px-3 py-1.5 border rounded-lg bg-accent text-accent-text hover:bg-accent-hover disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
            onClick={controller.addFolder}
            disabled={controller.adding || controller.scanning !== null || !controller.supported}
          >
            <Icons.folderOpen size={14} />
            {controller.adding ? 'Adding...' : 'Add Folder'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-3 min-h-0 px-6">
        {/* Sidebar */}
        {!isSidebarCollapsed && (
          <LocalFoldersSidebar
            controller={controller}
            providers={providers}
            folderNames={folderNames}
            hashingPhaseLabel={hashingPhaseLabel}
            hashingBytesLabel={hashingBytesLabel}
            favoriteFoldersSet={favoriteFoldersSet}
            toggleFavoriteFolder={toggleFavoriteFolder}
            handleTreeOpen={callbacks.handleTreeOpen}
            sidebarScrollRef={sidebarScrollRef}
            folderTreeScrollRef={folderTreeScrollRef}
          />
        )}

        {/* Main content */}
        <LocalFoldersContent
          controller={controller}
          displayAssets={displayAssets}
          localFilterDefs={localFilterDefs}
          groupMode={groupMode}
          selectGroupMode={selectGroupMode}
          isSidebarCollapsed={isSidebarCollapsed}
          toggleSidebar={toggleSidebar}
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
          getIsFavorite={callbacks.getIsFavorite}
          handleToggleFavorite={callbacks.handleToggleFavorite}
          getLocalMediaCardActions={callbacks.getLocalMediaCardActions}
          getFolderLabel={getFolderLabel}
          getSubfolderValue={getSubfolderValue}
          getSubfolderLabelForAsset={getSubfolderLabelForAsset}
          isAssetInFavoriteFolder={isAssetInFavoriteFolder}
        />
      </div>
    </div>
  );
}
