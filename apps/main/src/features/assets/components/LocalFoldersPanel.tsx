import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { CompositeIcon, Icons } from '@lib/icons';

import type { ClientFilterState } from '@features/gallery/lib/useClientFilters';
import { useProviders } from '@features/providers';

import type { LocalFoldersController } from '@/types/localSources';

import { useAssetViewer } from '../hooks/useAssetViewer';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import type { LocalAsset } from '../stores/localFoldersStore';

import {
  ALL_ASSETS_SCROLL_SCOPE,
  type ContentScrollByScope,
  type LocalGroupMode,
} from './localFolders/constants';
import { buildLocalFilterDefs } from './localFolders/filterDefs';
import { LocalFoldersContent } from './localFolders/LocalFoldersContent';
import {
  readStoredContentScrollByScope,
  readStoredGroupMode,
  writeStoredContentScrollByScope,
  writeStoredGroupMode,
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

  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollByScopeRef = useRef<ContentScrollByScope | null>(null);

  const [groupMode, setGroupMode] = useState<LocalGroupMode>(() => readStoredGroupMode());
  const [isManageFoldersOpen, setIsManageFoldersOpen] = useState(false);
  const manageFoldersTriggerRef = useRef<HTMLButtonElement>(null);

  const selectGroupMode = useCallback((next: LocalGroupMode) => {
    setGroupMode(next);
    writeStoredGroupMode(next);
  }, []);

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

    return [];
  }, [favoriteRootFolderIds]);

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

  const contentScrollScope = ALL_ASSETS_SCROLL_SCOPE;

  // --- Callbacks hook ---
  const callbacks = useLocalFolderCallbacks({
    controller,
    openLocalAsset,
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
      {/* Top bar */}
      <div className="flex-shrink-0 mb-3 px-6 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold truncate">Local Folders</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Provider selector */}
            <select
              className="px-2 py-1 border rounded-lg bg-white dark:bg-neutral-800 text-xs focus:ring-2 focus:ring-accent focus:border-accent"
              value={controller.providerId || ''}
              onChange={(e) => controller.setProviderId(e.target.value || undefined)}
            >
              <option value="">Library only</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Manage Folders dropdown */}
            <div className="relative">
              <button
                ref={manageFoldersTriggerRef}
                type="button"
                className="px-2.5 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
                onClick={() => setIsManageFoldersOpen((prev) => !prev)}
              >
                <Icons.settings size={13} />
                Manage
              </button>
              <Dropdown
                isOpen={isManageFoldersOpen}
                onClose={() => setIsManageFoldersOpen(false)}
                position="bottom-right"
                minWidth="220px"
                triggerRef={manageFoldersTriggerRef}
              >
                {controller.folders.length === 0 ? (
                  <DropdownItem disabled>No folders added</DropdownItem>
                ) : (
                  controller.folders.map((folder) => (
                    <div key={folder.id}>
                      <div className="px-2 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 truncate flex items-center gap-2">
                        <Icons.folder size={12} className="flex-shrink-0 text-neutral-400" />
                        <span className="truncate">{folderNames[folder.id] || folder.id}</span>
                      </div>
                      <div className="flex items-center gap-0.5 px-1 pb-1">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                          title="Refresh"
                          onClick={() => { controller.refreshFolder(folder.id); setIsManageFoldersOpen(false); }}
                        >
                          <Icons.refreshCw size={12} />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                          title="Hash files"
                          onClick={() => { controller.hashFolder(folder.id); setIsManageFoldersOpen(false); }}
                        >
                          <Icons.hash size={12} />
                        </button>
                        <button
                          type="button"
                          className={`p-1 rounded transition-colors ${
                            favoriteFoldersSet.has(folder.id)
                              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                              : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-amber-500'
                          }`}
                          title={favoriteFoldersSet.has(folder.id) ? 'Remove from favorites' : 'Add to favorites'}
                          onClick={() => toggleFavoriteFolder(folder.id)}
                        >
                          <Icons.star size={12} />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Remove folder"
                          onClick={() => { controller.removeFolder(folder.id); setIsManageFoldersOpen(false); }}
                        >
                          <Icons.trash size={12} />
                        </button>
                      </div>
                      {controller.folders.indexOf(folder) < controller.folders.length - 1 && (
                        <DropdownDivider />
                      )}
                    </div>
                  ))
                )}
              </Dropdown>
            </div>

            {/* Add Folder button */}
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

        {/* Scanning progress */}
        {controller.scanning && (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="font-medium">Scanning folder...</span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400">
                {controller.scanning.scanned.toLocaleString()} scanned, {controller.scanning.found.toLocaleString()} media found
              </span>
            </div>
          </div>
        )}

        {/* Hashing progress */}
        {controller.hashingProgress && (
          <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            {!controller.hashingPaused && (
              <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block truncate">
                {controller.hashingPaused
                  ? 'Paused'
                  : `Hashing ${controller.hashingProgress.done}/${controller.hashingProgress.total} (${hashingPhaseLabel})`}
              </span>
              {hashingBytesLabel && (
                <span className="block truncate opacity-80">
                  {hashingBytesLabel}
                  {controller.hashingProgress.activeAssetName
                    ? ` - ${controller.hashingProgress.activeAssetName}`
                    : ''}
                </span>
              )}
            </span>
            <button
              onClick={controller.hashingPaused ? controller.resumeHashing : controller.pauseHashing}
              className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              title={controller.hashingPaused ? 'Resume' : 'Pause'}
            >
              {controller.hashingPaused ? <Icons.play size={12} /> : <Icons.pause size={12} />}
            </button>
            <button
              onClick={controller.cancelHashing}
              className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              title="Cancel"
            >
              <Icons.x size={12} />
            </button>
          </div>
        )}

        {/* Browser unsupported / error banners */}
        {!controller.supported && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <Icons.alertTriangle size={16} />
            <span>Your browser does not support local folder access. Use Chrome/Edge.</span>
          </div>
        )}
        {controller.error && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400">
            {controller.error}
          </div>
        )}

        {/* Missing folders warning */}
        {controller.missingFolderNames.length > 0 && (
          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
              <Icons.alertTriangle size={14} />
              <span className="font-medium">Some folders need to be re-added</span>
              <button
                className="ml-auto text-[10px] text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 underline"
                onClick={controller.dismissMissingFolders}
              >
                Dismiss
              </button>
            </div>
            <p className="text-amber-600 dark:text-amber-400 text-[10px] mb-1.5">
              Browser storage was cleared. Click a missing folder below to restore it.
            </p>
            <div className="flex flex-wrap gap-1">
              {controller.missingFolderNames.map((name) => (
                <button
                  key={`missing:${name}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-200 dark:border-amber-700 bg-white dark:bg-neutral-900 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                  onClick={() => controller.restoreMissingFolder(name)}
                  title={`Click to re-add "${name}" folder`}
                >
                  <CompositeIcon name="folder" size={12} className="flex-shrink-0 text-amber-500/50" sub={{ name: 'plus', position: 'br', bg: 'amber' }} />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[140px]">
                    {name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 px-6">
        {/* Main content */}
        <LocalFoldersContent
          controller={controller}
          localFilterDefs={localFilterDefs}
          groupMode={groupMode}
          selectGroupMode={selectGroupMode}
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
          getFolderLabel={getFolderLabel}
          getSubfolderValue={getSubfolderValue}
          getSubfolderLabelForAsset={getSubfolderLabelForAsset}
          isAssetInFavoriteFolder={isAssetInFavoriteFolder}
        />
      </div>
    </div>
  );
}
