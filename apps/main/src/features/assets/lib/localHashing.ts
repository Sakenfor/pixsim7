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
  }>;
};

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
