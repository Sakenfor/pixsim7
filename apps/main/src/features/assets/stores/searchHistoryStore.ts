import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ENTRIES = 20;
const DEFAULT_DEBOUNCE_MS = 800;

interface SearchHistoryState {
  /** filterKey → ring buffer of past queries (newest first) */
  history: Record<string, string[]>;
  record: (filterKey: string, query: string) => void;
  remove: (filterKey: string, query: string) => void;
  clear: (filterKey: string) => void;
}

const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      history: {},
      record: (filterKey, query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((state) => {
          const existing = state.history[filterKey] ?? [];
          const [newest, ...rest] = existing;
          // Trailing-prefix coalescing: if the newest entry is a prefix
          // of the new query (or vice versa), replace it instead of
          // appending — collapses refinement chains like "ab" → "abc".
          // Also subsumes exact dedupe of the head.
          let next: string[];
          if (newest && (trimmed.startsWith(newest) || newest.startsWith(trimmed))) {
            next = [trimmed, ...rest.filter((q) => q !== trimmed)];
          } else {
            next = [trimmed, ...existing.filter((q) => q !== trimmed)];
          }
          if (next.length > MAX_ENTRIES) next = next.slice(0, MAX_ENTRIES);
          return { history: { ...state.history, [filterKey]: next } };
        });
      },
      remove: (filterKey, query) =>
        set((state) => {
          const existing = state.history[filterKey];
          if (!existing) return state;
          return {
            history: {
              ...state.history,
              [filterKey]: existing.filter((q) => q !== query),
            },
          };
        }),
      clear: (filterKey) =>
        set((state) => {
          if (!(filterKey in state.history)) return state;
          const next = { ...state.history };
          delete next[filterKey];
          return { history: next };
        }),
    }),
    { name: 'pixsim7-search-history' },
  ),
);

export interface SearchHistoryHandle {
  entries: string[];
  record: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}

export function useSearchHistory(filterKey: string): SearchHistoryHandle {
  const entries = useSearchHistoryStore((s) => s.history[filterKey] ?? EMPTY);
  const recordRaw = useSearchHistoryStore((s) => s.record);
  const removeRaw = useSearchHistoryStore((s) => s.remove);
  const clearRaw = useSearchHistoryStore((s) => s.clear);
  return {
    entries,
    record: (query: string) => recordRaw(filterKey, query),
    remove: (query: string) => removeRaw(filterKey, query),
    clear: () => clearRaw(filterKey),
  };
}

const EMPTY: string[] = [];

/**
 * Debounce-settled capture: every time `currentValue` changes, restart
 * a timer; when it stops changing for `delayMs`, record into history.
 * Restoring an entry by clicking re-fires the timer but coalescing
 * makes that a no-op (head already equals the value).
 *
 * Pass a falsy `filterKey` to disable capture — useful for surfaces
 * that opt in conditionally without conditional hook calls.
 */
export function useRecordSearchHistory(
  filterKey: string | null | undefined,
  currentValue: string | undefined,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): void {
  const record = useSearchHistoryStore((s) => s.record);
  useEffect(() => {
    if (!filterKey) return;
    const trimmed = (currentValue ?? '').trim();
    if (!trimmed) return;
    const handle = window.setTimeout(() => record(filterKey, trimmed), delayMs);
    return () => window.clearTimeout(handle);
  }, [filterKey, currentValue, delayMs, record]);
}
