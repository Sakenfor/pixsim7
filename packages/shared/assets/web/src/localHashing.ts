import {
  computeFileSha256Worker,
  type HashWorkerProgress,
} from './hashWorkerManager';

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

export type LocalHashAssetLike = {
  key: string;
  size?: number | null;
  lastModified?: number | null;
  sha256?: string | null;
  sha256_file_size?: number | null;
  sha256_last_modified?: number | null;
};

export function computeStableSignature(tokens: string[]): string {
  const sorted = [...tokens].sort();
  let hash = FNV_OFFSET_BASIS;

  for (const token of sorted) {
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME);
    }
  }

  return `${sorted.length}:${hash >>> 0}`;
}

export function computeLocalAssetScopeSignature<T extends Pick<LocalHashAssetLike, 'key' | 'size' | 'lastModified'>>(
  assets: T[],
): string {
  return computeStableSignature(
    assets.map((asset) => `${asset.key}|${asset.size ?? -1}|${asset.lastModified ?? -1}`),
  );
}

/**
 * Scheduling helper for large local folders.
 *
 * Prioritizes small files for immediate UI progress while periodically mixing in
 * large files to avoid a long "large-files-only" tail at the end.
 */
export function scheduleAssetsForHashing<T extends Pick<LocalHashAssetLike, 'size'>>(
  assets: T[],
): T[] {
  if (assets.length <= 2) {
    return [...assets];
  }

  const sorted = [...assets].sort(
    (a, b) => (a.size ?? Number.MAX_SAFE_INTEGER) - (b.size ?? Number.MAX_SAFE_INTEGER),
  );

  const scheduled: T[] = [];
  let left = 0;
  let right = sorted.length - 1;

  while (left <= right) {
    for (let i = 0; i < 2 && left <= right; i++) {
      scheduled.push(sorted[left]);
      left += 1;
    }

    if (left <= right) {
      scheduled.push(sorted[right]);
      right -= 1;
    }
  }

  return scheduled;
}

export function hasValidStoredHash(asset: LocalHashAssetLike): boolean {
  return !!asset.sha256
    && asset.sha256_file_size === asset.size
    && asset.sha256_last_modified === asset.lastModified;
}

export function hasValidHashForFile(asset: LocalHashAssetLike, file: File): boolean {
  return !!asset.sha256
    && asset.sha256_file_size === file.size
    && asset.sha256_last_modified === file.lastModified;
}

type EnsureLocalAssetSha256Input = Pick<
  LocalHashAssetLike,
  'key' | 'sha256' | 'sha256_file_size' | 'sha256_last_modified'
>;

type EnsureLocalAssetSha256Options = {
  onProgress?: (progress: HashWorkerProgress) => void;
};

export async function ensureLocalAssetSha256<T extends EnsureLocalAssetSha256Input>(
  asset: T,
  file: File,
  updateAssetHash: (assetKey: string, sha256: string, file: File) => Promise<void>,
  options?: EnsureLocalAssetSha256Options,
): Promise<string> {
  if (hasValidHashForFile(asset, file) && asset.sha256) {
    return asset.sha256;
  }

  const sha256 = await computeFileSha256Worker(file, {
    onProgress: options?.onProgress,
  });
  await updateAssetHash(asset.key, sha256, file);
  return sha256;
}

export type { EnsureLocalAssetSha256Options, HashWorkerProgress };
