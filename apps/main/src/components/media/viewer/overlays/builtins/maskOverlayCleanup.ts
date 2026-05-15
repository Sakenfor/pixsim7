/**
 * Mask overlay draft localStorage hygiene.
 *
 * Mask drafts are persisted per asset (`ps7_mask_overlay_draft_v2:<source>:<id>`)
 * and individual drafts can hit 200–300 KB (strokes + polygons). Without
 * bounded retention they accumulate indefinitely and eventually exhaust the
 * origin's localStorage quota.
 *
 * Unlike chat-tab caches, we can't classify drafts as orphan-or-not at boot
 * (the client has no authoritative "all asset ids" snapshot). Instead, we
 * cap retention by recency + age:
 *
 *   - Keep at most `MAX_DRAFTS` most recently saved drafts (LRU by `savedAt`).
 *   - Drop anything older than `MAX_AGE_MS` regardless of count.
 *
 * Kept dependency-free so it can be imported eagerly from `main.tsx` for
 * boot-time cleanup without pulling in the React mask-overlay component.
 */

export const MASK_DRAFT_STORAGE_PREFIX = 'ps7_mask_overlay_draft_v2';

const MAX_DRAFTS = 20;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DraftIndexEntry {
  key: string;
  savedAt: number;
}

export interface MaskDraftSweepResult {
  scanned: number;
  removedByAge: number;
  removedByCap: number;
  removedInvalid: number;
}

export function sweepMaskOverlayDrafts(now: number = Date.now()): MaskDraftSweepResult {
  const result: MaskDraftSweepResult = {
    scanned: 0,
    removedByAge: 0,
    removedByCap: 0,
    removedInvalid: 0,
  };
  if (typeof localStorage === 'undefined') return result;

  const prefix = `${MASK_DRAFT_STORAGE_PREFIX}:`;
  const ageCutoff = now - MAX_AGE_MS;
  const survivors: DraftIndexEntry[] = [];
  const toRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      result.scanned += 1;

      const raw = localStorage.getItem(key);
      if (!raw) {
        toRemove.push(key);
        result.removedInvalid += 1;
        continue;
      }

      let savedAt: number | null = null;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: unknown };
        if (parsed && typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)) {
          savedAt = parsed.savedAt;
        }
      } catch {
        // Malformed JSON — drop it.
        toRemove.push(key);
        result.removedInvalid += 1;
        continue;
      }

      // Entries with no usable savedAt sort to the bottom (oldest); they're
      // tolerated until the count cap evicts them.
      const effectiveSavedAt = savedAt ?? 0;
      if (savedAt !== null && savedAt < ageCutoff) {
        toRemove.push(key);
        result.removedByAge += 1;
        continue;
      }

      survivors.push({ key, savedAt: effectiveSavedAt });
    }

    // Enforce count cap: keep the MAX_DRAFTS most recent survivors.
    if (survivors.length > MAX_DRAFTS) {
      survivors.sort((a, b) => b.savedAt - a.savedAt);
      const overflow = survivors.slice(MAX_DRAFTS);
      for (const entry of overflow) {
        toRemove.push(entry.key);
        result.removedByCap += 1;
      }
    }

    for (const key of toRemove) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  } catch {
    // Best-effort; storage errors are non-fatal.
  }

  return result;
}
