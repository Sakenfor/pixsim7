import type {
  ClientFilterDef,
  ClientFilterState,
} from '@features/gallery/lib/useClientFilters';

import type { LocalAsset } from '../../stores/localFoldersStore';

import type { HashFilterState, UploadFilterState } from './constants';

export interface BuildLocalFilterDefsDeps {
  getFolderLabel: (folderId: string) => string;
  getFolderFilterLabel: (folderId: string) => string;
  isFavoriteRootFolder: (folderId: string) => boolean;
  isAssetInFavoriteFolder: (asset: LocalAsset) => boolean;
  favoriteFoldersSet: ReadonlySet<string>;
  getScopedFolderIds: (filterState: ClientFilterState) => string[];
  getSubfolderValue: (asset: LocalAsset) => string;
  getSubfolderLabelForAsset: (asset: LocalAsset) => string;
  getUploadFilterState: (asset: LocalAsset) => UploadFilterState;
  getHashFilterState: (asset: LocalAsset) => HashFilterState;
  favoriteStatus: Record<string, boolean>;
}

export function buildLocalFilterDefs(deps: BuildLocalFilterDefsDeps): ClientFilterDef<LocalAsset>[] {
  const {
    getFolderLabel,
    getFolderFilterLabel,
    isFavoriteRootFolder,
    isAssetInFavoriteFolder,
    favoriteFoldersSet,
    getScopedFolderIds,
    getSubfolderValue,
    getSubfolderLabelForAsset,
    getUploadFilterState,
    getHashFilterState,
    favoriteStatus,
  } = deps;

  return [
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
        return favoriteStatus[asset.key] ?? false;
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
  ];
}
