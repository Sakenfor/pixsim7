import { withCorrelationHeaders } from '@lib/api/correlationHeaders';
import { authService } from '@lib/auth';

export {
  computeLocalAssetScopeSignature,
  computeStableSignature,
  ensureLocalAssetSha256,
  hasValidHashForFile,
  hasValidStoredHash,
  scheduleAssetsForHashing,
  type EnsureLocalAssetSha256Options,
  type HashWorkerProgress,
  type LocalHashAssetLike,
} from '@pixsim7/shared.assets.web';

type HashBatchResponse = {
  results?: Array<{
    sha256: string;
    exists: boolean;
    asset_id?: number;
  }>;
};

export type HashBatchMatch = { sha256: string; assetId: number };

export async function checkHashesAgainstBackend(
  hashes: string[],
  options?: {
    backendUrl?: string;
    token?: string;
  }
): Promise<HashBatchMatch[]> {
  const uniqueHashes = Array.from(new Set(hashes.filter(Boolean)));
  if (uniqueHashes.length === 0) return [];

  // Empty env var = relative mode. Undefined = hardcoded fallback.
  const envBase = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';
  const base = options?.backendUrl ?? envBase;
  const token = options?.token ?? authService.getStoredToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/check-by-hash-batch`, {
    method: 'POST',
    headers: withCorrelationHeaders(headers, 'assets:local-hash-batch-check'),
    body: JSON.stringify({ hashes: uniqueHashes }),
  });
  if (!res.ok) {
    throw new Error(`Hash batch check failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as HashBatchResponse;
  return (data.results || [])
    .filter((r): r is { sha256: string; exists: true; asset_id: number } => r.exists && typeof r.asset_id === 'number')
    .map((r) => ({ sha256: r.sha256, assetId: r.asset_id }));
}
