/**
 * Shared helpers for the Maintenance dashboard surfaces (dashboard rows,
 * storage overview, duplicates, duration cohorts).
 *
 * Consolidates what was previously copy-pasted per file:
 *  - authenticated fetch (now routed through the canonical `pixsimClient`,
 *    which adds token injection, correlation headers, and 401→/login redirect)
 *  - a session-level stats cache (survives panel close/reopen)
 *  - byte / number formatting
 *
 * The className→size Spinner alias lives in `MaintenanceSpinner.tsx` (kept in a
 * separate file so this module exports only non-components, per react-refresh).
 */
import { pixsimClient, BACKEND_BASE } from '@lib/api';
import { extractErrorMessage } from '@lib/api/errorHandling';

export { extractErrorMessage };

// ---------------------------------------------------------------------------
// Fetch — canonical client wrappers. `surface` is preserved as the
// X-Client-Surface trace tag the hand-rolled fetch used to set manually.
// ---------------------------------------------------------------------------

export function maintGet<T>(path: string, surface: string): Promise<T> {
  return pixsimClient.get<T>(path, { headers: { 'X-Client-Surface': surface } });
}

export function maintPost<T>(
  path: string,
  surface: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return pixsimClient.post<T>(path, body, {
    headers: { 'X-Client-Surface': surface },
    // Per-call override for long-running maintenance actions (e.g. bulk
    // relocation) so they aren't cut by the default client timeout.
    ...(opts?.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  });
}

export function maintPatch<T>(path: string, body: unknown, surface: string): Promise<T> {
  return pixsimClient.patch<T>(path, body, { headers: { 'X-Client-Surface': surface } });
}

export function maintPut<T>(path: string, body: unknown, surface: string): Promise<T> {
  return pixsimClient.put<T>(path, body, { headers: { 'X-Client-Surface': surface } });
}

export function maintDelete<T>(path: string, surface: string): Promise<T> {
  return pixsimClient.delete<T>(path, { headers: { 'X-Client-Surface': surface } });
}

/**
 * GET a ROOT path that lives OUTSIDE `/api/v1` (e.g. `/health`, `/ready`).
 * `pixsimClient` always prepends `/api/v1`, so those probes can't go through
 * the wrappers above. Hits `BACKEND_BASE` directly; the Vite dev proxy forwards
 * `/health` to the main API. These probes are unauthenticated by design.
 */
export async function maintGetRoot<T>(path: string, surface: string): Promise<T> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    headers: { 'X-Client-Surface': surface },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Stats cache — survives panel close/reopen within a session (component state
// would otherwise reset every mount and re-fire the queries). TTL keeps it
// honest if arq workers / other tabs mutate underneath us. Busted explicitly
// by the refresh button and after any mutating action.
// ---------------------------------------------------------------------------

const STATS_CACHE_TTL_MS = 60_000;
const statsCache = new Map<string, { value: unknown; fetchedAt: number }>();

export function readStatsCache<T>(key: string): T | null {
  const entry = statsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > STATS_CACHE_TTL_MS) {
    statsCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeStatsCache(key: string, value: unknown): void {
  statsCache.set(key, { value, fetchedAt: Date.now() });
}

export function bustStatsCache(key?: string): void {
  if (key) statsCache.delete(key);
  else statsCache.clear();
}

/** Cache-aware GET — returns a fresh cache hit, otherwise fetches and stores. */
export async function cachedGet<T>(path: string, surface: string): Promise<T> {
  const hit = readStatsCache<T>(path);
  if (hit !== null) return hit;
  const data = await maintGet<T>(path, surface);
  writeStatsCache(path, data);
  return data;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmt(n: number): string {
  return n.toLocaleString();
}

export function humanBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  // Whole bytes read better without a decimal; everything else gets one.
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
