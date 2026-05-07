/**
 * Read-only snapshot of recent prompt entries for cross-feature consumers
 * (e.g. the news ticker's `recent-prompts` source).
 *
 * Wraps the localStorage layout owned by `usePromptHistory` so consumers
 * don't have to reach into the storage key directly. If the persistence
 * shape ever changes, only this file needs updating.
 */

const STORAGE_KEY = 'prompt_draft_history_v1';

export interface RecentPromptEntry {
  /** Stable id from the underlying history entry. */
  id: string;
  /** Prompt text. */
  value: string;
  /** Whether the user pinned this entry. */
  pinned: boolean;
  /**
   * Persistence scope this entry came from (e.g. `quickGen`,
   * `template:abc`). Lets consumers segment by surface if they care.
   */
  scope: string;
}

interface StoredHistoryEntry {
  id?: unknown;
  value?: unknown;
  pinned?: unknown;
}

interface StoredHistoryStack {
  past?: unknown;
  future?: unknown;
  current?: unknown;
}

function normalizeEntry(value: unknown, scope: string): RecentPromptEntry | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as StoredHistoryEntry;
  if (typeof e.value !== 'string' || e.value.trim().length === 0) return null;
  return {
    id: typeof e.id === 'string' && e.id.length > 0 ? e.id : `${scope}:${e.value}`,
    value: e.value,
    pinned: e.pinned === true,
    scope,
  };
}

/**
 * Read the most recent prompt entries across all persistence scopes.
 *
 * Order: each scope's `current` (most recent) first, then its `past` from
 * newest to oldest. Deduped by `value` so the same prompt across scopes
 * appears once. Returns up to `limit` entries.
 */
export function readRecentPrompts(limit = 20): RecentPromptEntry[] {
  if (typeof localStorage === 'undefined') return [];
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let map: Record<string, StoredHistoryStack>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    map = parsed as Record<string, StoredHistoryStack>;
  } catch {
    return [];
  }

  const collected: RecentPromptEntry[] = [];
  for (const [scope, stack] of Object.entries(map)) {
    if (!stack || typeof stack !== 'object') continue;
    const current = normalizeEntry(stack.current, scope);
    if (current) collected.push(current);
    const past = Array.isArray(stack.past) ? [...stack.past].reverse() : [];
    for (const entry of past) {
      const normalized = normalizeEntry(entry, scope);
      if (normalized) collected.push(normalized);
    }
  }

  // Dedupe by value across scopes; keep first occurrence (most recent).
  const seen = new Set<string>();
  const out: RecentPromptEntry[] = [];
  for (const entry of collected) {
    if (seen.has(entry.value)) continue;
    seen.add(entry.value);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}
