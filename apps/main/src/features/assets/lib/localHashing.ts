import { authService } from '@lib/auth';

import type { LocalAsset } from '../stores/localFoldersStore';

import { computeFileSha256Worker } from './hashWorkerManager';

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

type HashBatchResponse = {
  results?: Array<{
    sha256: string;
    exists: boolean;
  }>;
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

export function computeLocalAssetScopeSignature(assets: LocalAsset[]): string {
  return computeStableSignature(
    assets.map(asset => `${asset.key}|${asset.size ?? -1}|${asset.lastModified ?? -1}`)
  );
}

export function hasValidStoredHash(asset: LocalAsset): boolean {
  return !!asset.sha256
    && asset.sha256_file_size === asset.size
    && asset.sha256_last_modified === asset.lastModified;
}

export function hasValidHashForFile(asset: LocalAsset, file: File): boolean {
  return !!asset.sha256
    && asset.sha256_file_size === file.size
    && asset.sha256_last_modified === file.lastModified;
}

export async function ensureLocalAssetSha256(
  asset: LocalAsset,
  file: File,
  updateAssetHash: (assetKey: string, sha256: string, file: File) => Promise<void>
): Promise<string> {
  if (hasValidHashForFile(asset, file) && asset.sha256) {
    return asset.sha256;
  }

  const sha256 = await computeFileSha256Worker(file);
  await updateAssetHash(asset.key, sha256, file);
  return sha256;
}

export async function checkHashesAgainstBackend(
  hashes: string[],
  options?: {
    backendUrl?: string;
    token?: string;
  }
): Promise<Set<string>> {
  const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
  if (uniqueHashes.length === 0) return new Set();

  const base = options?.backendUrl ?? (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000');
  const token = options?.token ?? authService.getStoredToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/check-by-hash-batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ hashes: uniqueHashes }),
  });
  if (!res.ok) {
    throw new Error(`Hash batch check failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as HashBatchResponse;
  return new Set(
    (data.results || [])
      .filter((r) => r.exists)
      .map((r) => r.sha256)
  );
}
