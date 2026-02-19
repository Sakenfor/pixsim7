import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { Icons } from '@lib/icons';

import {
  type ClientFilterDef,
  type ClientFilterState,
} from '@features/gallery/lib/useClientFilters';
import { useMediaGenerationActions } from '@features/generation/hooks/useMediaGenerationActions';
import { useProviders } from '@features/providers';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';
import type { MediaCardActions } from '@/components/media/MediaCard';
import type { LocalFoldersController } from '@/types/localSources';

import { useAssetViewer } from '../hooks/useAssetViewer';
import { useLocalAssetPreview } from '../hooks/useLocalAssetPreview';
import type { AssetModel } from '../models/asset';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import type { LocalAsset } from '../stores/localFoldersStore';

import { ClientFilteredGallerySection } from './shared/ClientFilteredGallerySection';
import { TreeFolderView } from './TreeFolderView';

interface LocalFoldersPanelProps {
  controller: LocalFoldersController;
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

const SIDEBAR_SCROLL_KEY = 'ps7_localFolders_sidebar_scroll_top';
const FOLDER_TREE_SCROLL_KEY = 'ps7_localFolders_tree_scroll_top';
const CONTENT_SCROLL_BY_SCOPE_KEY = 'ps7_localFolders_content_scroll_by_scope';
const SIDEBAR_COLLAPSED_KEY = 'ps7_localFolders_sidebar_collapsed';
const GROUP_MODE_KEY = 'ps7_localFolders_group_mode';
const ALL_ASSETS_SCROLL_SCOPE = '__all__';
const SUBFOLDER_VALUE_SEPARATOR = '::';
const ROOT_SUBFOLDER_VALUE = '__root__';
const LOCAL_MEDIA_CARD_PRESET = 'media-card-local-folders';
type ContentScrollByScope = Record<string, number>;
type UploadFilterState = 'uploaded' | 'uploading' | 'failed' | 'pending';
type HashFilterState = 'duplicate' | 'unique' | 'hashing' | 'unhashed';
type LocalGroupMode = 'none' | 'folder' | 'subfolder';

const GROUP_MODE_OPTIONS: Array<{ value: LocalGroupMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'folder', label: 'Folder' },
  { value: 'subfolder', label: 'Subfolder' },
];

function readStoredGroupMode(): LocalGroupMode {
  try {
    const raw = localStorage.getItem(GROUP_MODE_KEY);
    if (raw === 'folder' || raw === 'subfolder') return raw;
    return 'none';
  } catch {
    return 'none';
  }
}

function writeStoredGroupMode(value: LocalGroupMode): void {
  try {
    localStorage.setItem(GROUP_MODE_KEY, value);
  } catch {
    // Best effort persistence only
  }
}

function getDirectoryFromRelativePath(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  if (idx <= 0) return '';
  return relativePath.slice(0, idx);
}

function makeSubfolderValue(folderId: string, directory: string): string {
  const normalized = directory || ROOT_SUBFOLDER_VALUE;
  return `${folderId}${SUBFOLDER_VALUE_SEPARATOR}${normalized}`;
}

function parseSubfolderValue(raw: string): { folderId: string; directory: string } | null {
  const splitIndex = raw.indexOf(SUBFOLDER_VALUE_SEPARATOR);
  if (splitIndex <= 0) return null;
  const folderId = raw.slice(0, splitIndex);
  const directoryRaw = raw.slice(splitIndex + SUBFOLDER_VALUE_SEPARATOR.length);
  if (!folderId || !directoryRaw) return null;
  const directory = directoryRaw === ROOT_SUBFOLDER_VALUE ? '' : directoryRaw;
  return { folderId, directory };
}

function isAssetInFolderScope(asset: LocalAsset, folderPath: string): boolean {
  if (folderPath === asset.folderId) {
    return !asset.relativePath.includes('/');
  }

  if (!folderPath.startsWith(asset.folderId + '/')) {
    return false;
  }

  const selectedRelPath = folderPath.slice(asset.folderId.length + 1);
  const assetDir = asset.relativePath.includes('/')
    ? asset.relativePath.split('/').slice(0, -1).join('/')
    : '';

  return assetDir === selectedRelPath;
}

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

function readStoredBoolean(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
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

function hashStringToStableNegativeId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) || 1;
  return -normalized;
}

export function LocalFoldersPanel({ controller, layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const toast = useToast();
  const { providers } = useProviders();
  const {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  } = useMediaGenerationActions();
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
    const base = getFolderLabel(folderId);
    return isFavoriteRootFolder(folderId) ? `Fav - ${base}` : base;
  }, [getFolderLabel, isFavoriteRootFolder]);
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

    if (favoriteFoldersOnly) {
      return Array.from(favoriteRootFolderIds);
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
    (asset: LocalAsset): AssetUploadState =>
      controller.uploadStatus[asset.key] || asset.last_upload_status || 'idle',
    [controller.uploadStatus]
  );
  const getUploadFilterState = useCallback((asset: LocalAsset): UploadFilterState => {
    const state = getUploadState(asset);
    if (state === 'success') return 'uploaded';
    if (state === 'uploading') return 'uploading';
    if (state === 'error') return 'failed';
    return 'pending';
  }, [getUploadState]);
  const getHashFilterState = useCallback((asset: LocalAsset): HashFilterState => {
    if (!asset.sha256) {
      return controller.hashingProgress ? 'hashing' : 'unhashed';
    }
    const dupCount = shaDuplicates.get(asset.sha256) || 1;
    return dupCount > 1 ? 'duplicate' : 'unique';
  }, [controller.hashingProgress, shaDuplicates]);
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
  const localFilterDefs = useMemo<ClientFilterDef<LocalAsset>[]>(() => [
    {
      key: 'q',
      label: 'Search',
      icon: 'search',
      type: 'search',
      order: 0,
      predicate: (asset, value) => {
        if (typeof value !== 'string' || !value) return true;
        const needle = value.toLowerCase().trim();
        if (!needle) return true;
        return (
          asset.name.toLowerCase().includes(needle) ||
          asset.relativePath.toLowerCase().includes(needle) ||
          (asset.sha256?.toLowerCase().includes(needle) ?? false)
        );
      },
    },
    {
      key: 'media_type',
      label: 'Media Type',
      icon: 'video',
      type: 'enum',
      order: 1,
      predicate: (asset, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        const mediaType = asset.kind === 'video' ? 'video' : 'image';
        return value.includes(mediaType);
      },
      deriveOptionsWithCounts: (items) => {
        let imageCount = 0;
        let videoCount = 0;
        for (const item of items) {
          if (item.kind === 'video') videoCount += 1;
          else imageCount += 1;
        }
        const options: Array<{ value: string; label: string; count: number }> = [];
        if (imageCount > 0) options.push({ value: 'image', label: 'Image', count: imageCount });
        if (videoCount > 0) options.push({ value: 'video', label: 'Video', count: videoCount });
        return options;
      },
    },
    {
      key: 'folder',
      label: 'Folder',
      icon: 'folder',
      type: 'enum',
      order: 2,
      predicate: (asset, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(asset.folderId);
      },
      deriveOptionsWithCounts: (items) => {
        const counts = new Map<string, number>();
        for (const item of items) {
          counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
        }
        return Array.from(counts.entries())
          .sort((left, right) => {
            const leftFav = isFavoriteRootFolder(left[0]);
            const rightFav = isFavoriteRootFolder(right[0]);
            if (leftFav !== rightFav) return leftFav ? -1 : 1;
            return getFolderLabel(left[0]).localeCompare(getFolderLabel(right[0]));
          })
          .map(([folderId, count]) => ({ value: folderId, label: getFolderFilterLabel(folderId), count }));
      },
    },
    {
      key: 'favorite_folders',
      label: 'Favorite Folders',
      icon: 'star',
      type: 'boolean',
      order: 3,
      isVisible: () => favoriteFoldersSet.size > 0,
      predicate: (asset, value) => {
        if (value !== true) return true;
        return isAssetInFavoriteFolder(asset);
      },
    },
    {
      key: 'subfolder',
      label: 'Subfolder',
      icon: 'folderTree',
      type: 'enum',
      order: 4,
      isVisible: (filterState) => getScopedFolderIds(filterState).length > 0,
      predicate: (asset, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(getSubfolderValue(asset));
      },
      deriveOptionsWithCounts: (items, filterState) => {
        const scopedFolderIds = new Set(getScopedFolderIds(filterState));
        if (scopedFolderIds.size === 0) {
          return [];
        }

        const subfolderOptions = new Map<string, { label: string; count: number }>();
        for (const item of items) {
          if (!scopedFolderIds.has(item.folderId)) continue;

          const value = getSubfolderValue(item);
          const existing = subfolderOptions.get(value);
          if (existing) {
            existing.count += 1;
          } else {
            subfolderOptions.set(value, {
              label: getSubfolderLabelForAsset(item),
              count: 1,
            });
          }
        }

        return Array.from(subfolderOptions.entries())
          .sort((left, right) => left[1].label.localeCompare(right[1].label))
          .map(([value, data]) => ({ value, label: data.label, count: data.count }));
      },
    },
    {
      key: 'upload_state',
      label: 'Upload State',
      icon: 'shield',
      type: 'enum',
      order: 5,
      predicate: (asset, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(getUploadFilterState(asset));
      },
      deriveOptionsWithCounts: (items) => {
        const values = new Map<UploadFilterState, number>();
        for (const item of items) {
          const state = getUploadFilterState(item);
          values.set(state, (values.get(state) || 0) + 1);
        }
        const ordered: Array<{ value: UploadFilterState; label: string }> = [
          { value: 'uploaded', label: 'Uploaded' },
          { value: 'uploading', label: 'Uploading' },
          { value: 'failed', label: 'Failed' },
          { value: 'pending', label: 'Not Uploaded' },
        ];
        return ordered
          .filter((entry) => values.has(entry.value))
          .map((entry) => ({ value: entry.value, label: entry.label, count: values.get(entry.value) || 0 }));
      },
    },
    {
      key: 'favorites',
      label: 'Favorites',
      icon: 'heart',
      type: 'boolean',
      order: 6,
      predicate: (asset, value) => {
        if (value !== true) return true;
        return controller.favoriteStatus[asset.key] ?? false;
      },
    },
    {
      key: 'hash_state',
      label: 'Hash State',
      icon: 'hash',
      type: 'enum',
      order: 7,
      overflow: true,
      predicate: (asset, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(getHashFilterState(asset));
      },
      deriveOptionsWithCounts: (items) => {
        const values = new Map<HashFilterState, number>();
        for (const item of items) {
          const state = getHashFilterState(item);
          values.set(state, (values.get(state) || 0) + 1);
        }
        const ordered: Array<{ value: HashFilterState; label: string }> = [
          { value: 'duplicate', label: 'Duplicate' },
          { value: 'unique', label: 'Unique' },
          { value: 'hashing', label: 'Hashing' },
          { value: 'unhashed', label: 'Unhashed' },
        ];
        return ordered
          .filter((entry) => values.has(entry.value))
          .map((entry) => ({ value: entry.value, label: entry.label, count: values.get(entry.value) || 0 }));
      },
    },
  ], [
    controller.favoriteStatus,
    favoriteFoldersSet,
    getFolderFilterLabel,
    getFolderLabel,
    getHashFilterState,
    getScopedFolderIds,
    isAssetInFavoriteFolder,
    isFavoriteRootFolder,
    getSubfolderLabelForAsset,
    getSubfolderValue,
    getUploadFilterState,
  ]);
  const openAssetInViewer = useCallback(
    async (
      asset: LocalAsset,
      viewerItems: LocalAsset[],
      resolvedPreviewUrl?: string,
    ) => {
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
      openLocalAsset(asset, previewUrl, viewerItems, controllerPreviews, fullUrl);
    },
    [openLocalAsset, controllerPreviews, controllerGetFileForAsset]
  );
  const handleTreeOpen = useCallback(
    async (asset: LocalAsset, resolvedPreviewUrl?: string) => {
      await openAssetInViewer(asset, displayAssets, resolvedPreviewUrl);
    },
    [openAssetInViewer, displayAssets],
  );
  const handleUpload = useCallback(
    (asset: LocalAsset) => controllerUploadOne(asset),
    [controllerUploadOne]
  );
  const getIsFavorite = useCallback(
    (asset: LocalAsset) => controller.favoriteStatus[asset.key] ?? false,
    [controller.favoriteStatus],
  );
  const handleToggleFavorite = useCallback(async (asset: LocalAsset) => {
    const wasFavorite = controller.favoriteStatus[asset.key] ?? false;
    const needsLibrarySave = !asset.last_upload_asset_id;

    try {
      await controller.toggleFavoriteOne(asset);
      if (wasFavorite) {
        toast.success('Removed from favorites.');
      } else if (needsLibrarySave) {
        toast.success('Saved to library and added to favorites.');
      } else {
        toast.success('Added to favorites.');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update favorite.';
      toast.error(message);
    }
  }, [controller, toast]);
  const toGenerationInputAsset = useCallback((asset: LocalAsset): AssetModel => {
    const previewUrl = controllerPreviews[asset.key];
    const uploadedAssetId =
      typeof asset.last_upload_asset_id === 'number' && asset.last_upload_asset_id > 0
        ? asset.last_upload_asset_id
        : undefined;
    const assetId = uploadedAssetId ?? hashStringToStableNegativeId(asset.key);
    const createdAt = new Date(asset.lastModified || Date.now()).toISOString();
    const mediaType = asset.kind === 'video' ? 'video' : 'image';
    const providerStatus = uploadedAssetId ? 'ok' : 'local_only';
    const providerId = uploadedAssetId ? (controller.providerId || 'library') : 'local';

    return {
      id: assetId,
      createdAt,
      description: asset.name,
      durationSec: null,
      fileSizeBytes: asset.size ?? null,
      fileUrl: previewUrl ?? null,
      height: asset.height ?? null,
      isArchived: false,
      localPath: asset.relativePath,
      mediaType,
      previewUrl: previewUrl ?? null,
      providerAssetId: uploadedAssetId ? String(uploadedAssetId) : asset.key,
      providerId,
      providerStatus,
      remoteUrl: previewUrl ?? null,
      syncStatus: 'downloaded',
      thumbnailUrl: previewUrl ?? null,
      userId: 0,
      width: asset.width ?? null,
      sha256: asset.sha256 ?? null,
    };
  }, [controller.providerId, controllerPreviews]);
  const getLocalMediaCardActions = useCallback((asset: LocalAsset): MediaCardActions => ({
    onAddToGenerate: () => {
      queueAutoGenerate(toGenerationInputAsset(asset));
    },
    onImageToImage: asset.kind === 'video'
      ? undefined
      : () => {
        queueImageToImage(toGenerationInputAsset(asset));
      },
    onImageToVideo: asset.kind === 'video'
      ? undefined
      : () => {
        queueImageToVideo(toGenerationInputAsset(asset));
      },
    onAddToTransition: asset.kind === 'video'
      ? undefined
      : () => {
        queueAddToTransition(toGenerationInputAsset(asset));
      },
    onVideoExtend: asset.kind === 'video'
      ? () => {
        queueVideoExtend(toGenerationInputAsset(asset));
      }
      : undefined,
    // Keep quick-generate hidden for local cards until local-input payload flow is wired.
    onQuickAdd: undefined,
  }), [
    queueAddToTransition,
    queueAutoGenerate,
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    toGenerationInputAsset,
  ]);

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
  const renderMainContent = (galleryAssets: LocalAsset[]) => {
    // Show "no folders" empty state
    if (controller.assets.length === 0) {
      return noFoldersEmptyState;
    }

    // Show folder-specific empty state when folder is selected but empty
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
          <div ref={sidebarScrollRef} className="w-64 flex-shrink-0 space-y-4 overflow-y-auto">
            {/* Status + support/error */}
            <div className="space-y-2">
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
                Upload provider (optional)
              </label>
              <select
                className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                value={controller.providerId || ''}
                onChange={(e) => controller.setProviderId(e.target.value || undefined)}
              >
                <option value="">Library only (no provider)</option>
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
                      onFileClick={handleTreeOpen}
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
        )}

        {/* Main content - scrollable */}
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
      </div>
    </div>
  );
}
