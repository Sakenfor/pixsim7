import {
  computeFileSha256Worker,
  type HashWorkerProgress,
} from './hashWorkerManager';

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function hashToken(token: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export type LocalHashAssetLike = {
  key: string;
  size?: number | null;
  lastModified?: number | null;
  sha256?: string | null;
  sha256_file_size?: number | null;
  sha256_last_modified?: number | null;
};

export function computeStableSignature(tokens: string[]): string {
  // Order-independent linear-time signature. Keeps multiset sensitivity
  // without O(n log n) sorting for large folder scopes.
  let sum = 0;
  let xor = 0;
  let weighted = 0;

  for (const token of tokens) {
    const tokenHash = hashToken(token);
    sum = (sum + tokenHash) >>> 0;
    xor = (xor ^ tokenHash) >>> 0;
    weighted = (weighted + Math.imul(tokenHash ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  }

  const len = tokens.length >>> 0;
  const sigA = mix32(sum ^ Math.imul(len, 0x27d4eb2d));
  const sigB = mix32((xor + weighted + Math.imul(len, 0x165667b1)) >>> 0);
  return `${len}:${sigA}:${sigB}`;
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
