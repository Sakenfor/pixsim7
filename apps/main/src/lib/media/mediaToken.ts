/**
 * mediaToken — short-lived token for streaming backend media directly from a
 * `<video>`/`<img>` element `src`.
 *
 * Native media-element requests can't carry an Authorization header, so backend
 * media is otherwise downloaded into an authenticated blob before playback —
 * which defeats HTTP Range streaming (the whole file must arrive before the
 * first frame shows). Carrying a short-lived, read-only token in the URL query
 * string lets the element load the backend URL directly so the browser streams
 * it progressively. Mirrors the WebSocket `?token=` pattern the backend already
 * uses for the same "no headers on this request" constraint.
 *
 * The token is fetched once, cached, shared across concurrent callers, and
 * refreshed shortly before expiry.
 */
import { pixsimClient } from '@lib/api/client';

interface MediaTokenResponse {
  token: string;
  expires_in: number;
}

// Treat the token as expired this many ms early so an in-flight media request
// never races the real expiry boundary.
const EXPIRY_SKEW_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

function isFresh(): boolean {
  return cached !== null && Date.now() < cached.expiresAt - EXPIRY_SKEW_MS;
}

async function fetchMediaToken(): Promise<string> {
  // priority: this gates click-to-play on its cold path (first load / post-expiry)
  // — a read a human is waiting on — so it must skip the background GET queue
  // that a generation burst saturates, not starve behind it.
  const res = await pixsimClient.get<MediaTokenResponse>('/media/auth-token', { priority: true });
  const ttlMs = Math.max(0, (res.expires_in ?? 0) * 1000);
  cached = { token: res.token, expiresAt: Date.now() + ttlMs };
  return res.token;
}

/** Resolve a valid media token, fetching or refreshing as needed. */
export async function getMediaToken(): Promise<string> {
  if (isFresh()) return cached!.token;
  if (!inflight) {
    inflight = fetchMediaToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Synchronous peek — the cached token if still fresh, otherwise undefined. */
export function peekMediaToken(): string | undefined {
  return isFresh() ? cached!.token : undefined;
}

/**
 * Fire-and-forget warm-up so the token is cached before the first <video> needs
 * it (the first stream would otherwise wait on this round-trip). Idempotent and
 * deduped via getMediaToken; errors are swallowed (the stream falls back to
 * fetching on demand).
 */
export function warmMediaToken(): void {
  if (isFresh()) return;
  void getMediaToken().catch(() => {});
}

/** Append `token=` to an already-resolved backend media URL. */
export function appendMediaToken(url: string, token: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** Test seam — drop the cached token. */
export function __resetMediaTokenForTests(): void {
  cached = null;
  inflight = null;
}
