import { useCallback, useEffect, useMemo, useRef } from 'react';

import { Icons } from '@lib/icons';

import { useLocalFoldersController } from '@features/assets/hooks/useLocalFoldersController';
import { useProviders } from '@features/providers';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';

import { useAssetViewer } from '../hooks/useAssetViewer';
import { useLocalAssetPreview } from '../hooks/useLocalAssetPreview';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import type { LocalAsset } from '../stores/localFoldersStore';

import { TreeFolderView } from './TreeFolderView';

interface LocalFoldersPanelProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

const SIDEBAR_SCROLL_KEY = 'ps7_localFolders_sidebar_scroll_top';
const FOLDER_TREE_SCROLL_KEY = 'ps7_localFolders_tree_scroll_top';
const CONTENT_SCROLL_BY_SCOPE_KEY = 'ps7_localFolders_content_scroll_by_scope';
const ALL_ASSETS_SCROLL_SCOPE = '__all__';
type ContentScrollByScope = Record<string, number>;

function readStoredScrollTop(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredScrollTop(key: string, scrollTop: number): void {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.round(scrollTop))));
  } catch {
    // Best effort persistence only
  }
}

function readStoredContentScrollByScope(): ContentScrollByScope {
  try {
    const raw = localStorage.getItem(CONTENT_SCROLL_BY_SCOPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized: ContentScrollByScope = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        normalized[scope] = value;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeStoredContentScrollByScope(value: ContentScrollByScope): void {
  try {
    localStorage.setItem(CONTENT_SCROLL_BY_SCOPE_KEY, JSON.stringify(value));
  } catch {
    // Best effort persistence only
  }
}

function formatBytes(value: number): string {
  const bytes = Math.max(0, value);
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function LocalFoldersPanel({ layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const controller = useLocalFoldersController();
  const { providers } = useProviders();
  const favoriteFoldersArr = useLocalFolderSettingsStore((s) => s.favoriteFolders);
  const toggleFavoriteFolder = useLocalFolderSettingsStore((s) => s.toggleFavoriteFolder);
  const favoriteFoldersSet = useMemo(() => new Set(favoriteFoldersArr), [favoriteFoldersArr]);
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const folderTreeScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollByScopeRef = useRef<ContentScrollByScope | null>(null);

  const folderNames = useMemo(() => {
    return controller.folders.reduce((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {} as Record<string, string>);
  }, [controller.folders]);
  const localMetadataResolver = useCallback(
    (asset: LocalAsset) => ({
      folderName: folderNames[asset.folderId],
    }),
    [folderNames]
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
  const controllerPreviews = controller.previews;
  const controllerGetFileForAsset = controller.getFileForAsset;
  const controllerUploadOne = controller.uploadOne;
  const contentScrollScope = controller.selectedFolderPath || ALL_ASSETS_SCROLL_SCOPE;

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

  // Callbacks for AssetGallery - memoized to prevent re-renders
  const getAssetKey = useCallback((asset: LocalAsset) => asset.key, []);
  const getPreviewUrl = useCallback(
    (asset: LocalAsset) => controller.previews[asset.key],
    [controller.previews]
  );
  const getMediaType = useCallback(
    (asset: LocalAsset): 'video' | 'image' => (asset.kind === 'video' ? 'video' : 'image'),
    []
  );
  // Build a map of SHA → count for duplicate detection
  const shaDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of controller.assets) {
      if (asset.sha256) {
        counts.set(asset.sha256, (counts.get(asset.sha256) || 0) + 1);
      }
    }
    return counts;
  }, [controller.assets]);

  const getDescription = useCallback((asset: LocalAsset) => {
    const parts = [asset.name];

    // Add file size inline
    if (asset.size) {
      const sizeKB = asset.size / 1024;
      const sizeMB = sizeKB / 1024;
      const sizeStr = sizeMB >= 1
        ? `${sizeMB.toFixed(1)}MB`
        : `${Math.round(sizeKB)}KB`;
      parts.push(`(${sizeStr})`);
    }

    // Add SHA prefix if available
    if (asset.sha256) {
      parts.push(`• #${asset.sha256.slice(0, 6)}`);
    }

    return parts.join(' ');
  }, []);
  const getTags = useCallback(
    (asset: LocalAsset) => {
      const tags: string[] = [];

      // Folder path (if in subdirectory)
      const folderPath = asset.relativePath.split('/').slice(0, -1).join('/');
      if (folderPath) {
        tags.push(`📁 ${folderPath}`);
      }

      // File size
      if (asset.size) {
        const sizeKB = asset.size / 1024;
        const sizeMB = sizeKB / 1024;
        const sizeStr = sizeMB >= 1
          ? `${sizeMB.toFixed(1)} MB`
          : `${Math.round(sizeKB)} KB`;
        tags.push(sizeStr);
      }

      // SHA256 prefix (if computed) + duplicate indicator
      if (asset.sha256) {
        const dupCount = shaDuplicates.get(asset.sha256) || 1;
        if (dupCount > 1) {
          tags.push(`⚠️ ${dupCount} copies`);
        }
        tags.push(`#${asset.sha256.slice(0, 8)}`);
      }

      // Upload status
      if (asset.last_upload_status === 'success') {
        tags.push('✓ uploaded');
      } else if (asset.last_upload_asset_id) {
        tags.push(`→ asset:${asset.last_upload_asset_id}`);
      }

      return tags;
    },
    [shaDuplicates]
  );
  const getCreatedAt = useCallback(
    (asset: LocalAsset) => new Date(asset.lastModified || Date.now()).toISOString(),
    []
  );
  const getUploadState = useCallback(
    (asset: LocalAsset): AssetUploadState => controller.uploadStatus[asset.key] || 'idle',
    [controller.uploadStatus]
  );
  const getHashStatus = useCallback(
    (asset: LocalAsset): 'unique' | 'duplicate' | 'hashing' | undefined => {
      if (controller.uploadStatus[asset.key] === 'success') return undefined;
      if (!asset.sha256) {
        return controller.hashingProgress ? 'hashing' : undefined;
      }
      const dupCount = shaDuplicates.get(asset.sha256) || 1;
      return dupCount > 1 ? 'duplicate' : 'unique';
    },
    [shaDuplicates, controller.uploadStatus, controller.hashingProgress]
  );
  const handleOpen = useCallback(
    async (asset: LocalAsset, resolvedPreviewUrl?: string) => {
      const previewUrl = resolvedPreviewUrl || controllerPreviews[asset.key];
      // Get full-res file blob URL for the media viewer
      let fullUrl: string | undefined;
      try {
        const file = await controllerGetFileForAsset(asset);
        if (file) {
          fullUrl = URL.createObjectURL(file);
        }
      } catch {
        // Fall back to preview URL if file access fails
      }
      openLocalAsset(asset, previewUrl, displayAssets, controllerPreviews, fullUrl);
    },
    [openLocalAsset, displayAssets, controllerPreviews, controllerGetFileForAsset]
  );
  const handleUpload = useCallback(
    (asset: LocalAsset) => controllerUploadOne(asset),
    [controllerUploadOne]
  );

  // Empty state for no folders
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

  // Empty state for selected folder with no files
  const folderEmptyState = (
    <GalleryEmptyState
      icon="folder"
      title="No files in this folder"
    />
  );

  const renderMainContent = () => {
    // Show "no folders" empty state
    if (controller.assets.length === 0) {
      return noFoldersEmptyState;
    }

    // Show folder-specific empty state when folder is selected but empty
    if (controller.selectedFolderPath && displayAssets.length === 0) {
      return folderEmptyState;
    }

    return (
      <AssetGallery
        assets={displayAssets}
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
        layout={layout}
        cardSize={cardSize}
      />
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 mb-4 px-6">
        <h2 className="text-lg font-semibold">Local Folders</h2>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 px-6">
        {/* Sidebar */}
        <div ref={sidebarScrollRef} className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Add Folder + support/error */}
          <div className="space-y-2">
            <button
              className="w-full px-4 py-2 border rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              onClick={controller.addFolder}
              disabled={controller.adding || controller.scanning !== null || !controller.supported}
            >
              <Icons.folderOpen size={18} />
              {controller.adding ? 'Adding...' : 'Add Folder'}
            </button>

            {/* Scanning progress indicator */}
            {controller.scanning && (
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="font-medium">Scanning folder...</span>
                </div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 space-y-0.5">
                  <div>Files scanned: {controller.scanning.scanned.toLocaleString()}</div>
                  <div>Media found: {controller.scanning.found.toLocaleString()}</div>
                  {controller.scanning.currentPath && (
                    <div className="truncate opacity-75" title={controller.scanning.currentPath}>
                      {controller.scanning.currentPath}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hashing progress indicator */}
            {controller.hashingProgress && (
              <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                {!controller.hashingPaused && (
                  <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
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
          </div>

          {/* Provider selection */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Upload to
            </label>
            <select
              className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={controller.providerId || ''}
              onChange={(e) => controller.setProviderId(e.target.value || undefined)}
            >
              <option value="">Select provider</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Missing folders warning */}
          {controller.missingFolderNames.length > 0 && (
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
                <Icons.alertTriangle size={14} />
                <span className="font-medium">Some folders need to be re-added</span>
              </div>
              <p className="text-amber-600 dark:text-amber-400 text-[10px] mb-2">
                Browser storage was cleared. Click a missing folder below to restore it.
              </p>
              <button
                className="text-[10px] text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 underline"
                onClick={controller.dismissMissingFolders}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Folder selection + list */}
          {(controller.folders.length > 0 || controller.missingFolderNames.length > 0) && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
              <div className="text-[11px] font-medium p-2 text-neutral-500 dark:text-neutral-400 px-3 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700">
                <Icons.folderTree size={12} />
                <span>All Local Folders</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {/* Missing folder placeholders */}
                {controller.missingFolderNames.map((name) => (
                  <button
                    key={`missing:${name}`}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0 group"
                    onClick={() => controller.restoreMissingFolder(name)}
                    title={`Click to re-add "${name}" folder`}
                  >
                    <div className="relative flex-shrink-0">
                      <Icons.folder size={14} className="text-amber-500/50" />
                      <Icons.plus size={8} className="absolute -bottom-0.5 -right-0.5 text-amber-600 bg-white dark:bg-neutral-900 rounded-full" />
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400 truncate flex-1">
                      {name}
                    </span>
                    <span className="text-[10px] text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      Click to restore
                    </span>
                  </button>
                ))}

                {/* Real folders tree */}
                {controller.folders.length > 0 && (
                  <TreeFolderView
                    assets={controller.assets}
                    folderNames={folderNames}
                    folderOrder={controller.folders.map(f => f.id)}
                    onFileClick={handleOpen}
                    onPreview={controller.loadPreview}
                    previews={controller.previews}
                    uploadStatus={controller.uploadStatus}
                    onUpload={controller.uploadOne}
                    providerId={controller.providerId}
                    compactMode={true}
                    selectedFolderPath={controller.selectedFolderPath || undefined}
                    onFolderSelect={controller.setSelectedFolderPath}
                    onRemoveFolder={controller.removeFolder}
                    onRefreshFolder={controller.refreshFolder}
                    onHashFolder={controller.hashFolder}
                    favoriteFolders={favoriteFoldersSet}
                    onToggleFavorite={toggleFavoriteFolder}
                    scrollContainerRef={folderTreeScrollRef}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main content - scrollable */}
        <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}

