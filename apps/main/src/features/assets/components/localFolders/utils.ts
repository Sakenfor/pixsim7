import type { LocalAssetModel } from '../../types/localFolderMeta';

import { ROOT_SUBFOLDER_VALUE, SUBFOLDER_VALUE_SEPARATOR } from './constants';


export function getDirectoryFromRelativePath(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  if (idx <= 0) return '';
  return relativePath.slice(0, idx);
}

export function makeSubfolderValue(folderId: string, directory: string): string {
  const normalized = directory || ROOT_SUBFOLDER_VALUE;
  return `${folderId}${SUBFOLDER_VALUE_SEPARATOR}${normalized}`;
}

export function parseSubfolderValue(raw: string): { folderId: string; directory: string } | null {
  const splitIndex = raw.indexOf(SUBFOLDER_VALUE_SEPARATOR);
  if (splitIndex <= 0) return null;
  const folderId = raw.slice(0, splitIndex);
  const directoryRaw = raw.slice(splitIndex + SUBFOLDER_VALUE_SEPARATOR.length);
  if (!folderId || !directoryRaw) return null;
  const directory = directoryRaw === ROOT_SUBFOLDER_VALUE ? '' : directoryRaw;
  return { folderId, directory };
}

export function isAssetInFolderScope(asset: LocalAssetModel, folderPath: string): boolean {
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

export function formatBytes(value: number): string {
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

