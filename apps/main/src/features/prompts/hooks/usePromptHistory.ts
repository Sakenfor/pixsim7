/**
 * Prompt history for undo/redo.
 *
 * Supports in-memory history (default) and optional scoped persistence
 * when a persistenceKey is provided.
 */

import { useCallback, useEffect, useRef } from 'react';

interface HistoryEntry {
  id: string;
  value: string;
  pinned: boolean;
}

interface HistoryStack {
  past: HistoryEntry[];
  future: HistoryEntry[];
  current: HistoryEntry;
}

export interface PromptTimeline {
  /** All entries in chronological order: [...past, current, ...future(oldest-first)] */
  entries: string[];
  /** Stable IDs for each timeline entry */
  entryIds: string[];
  /** Pin state by index (same shape as entries) */
  pinnedByIndex: boolean[];
  /** Total pinned entries in the timeline */
  pinnedCount: number;
  /** Index of the current entry in the entries array */
  currentIndex: number;
}

export interface PromptHistoryOptions {
  maxEntries?: number;
  persistenceKey?: string | null;
}

export interface PromptHistoryControls {
  /** Record current value as a history entry (no-op if unchanged) */
  snapshot: (value: string) => void;
  /** Undo - returns restored value or null */
  undo: () => string | null;
  /** Redo - returns restored value or null */
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Toggle pin on a timeline entry index */
  togglePin: (timelineIndex: number) => boolean | null;
  /** Reset history with a new baseline */
  reset: (value: string) => void;
  /** Get the full timeline for display (snapshot - not reactive) */
  getTimeline: () => PromptTimeline;
  /** Jump to a specific timeline index - returns the value at that index or null */
  jumpTo: (timelineIndex: number) => string | null;
}

const STORAGE_KEY = 'prompt_draft_history_v1';
const DEFAULT_MAX_ENTRIES = 80;
let persistedCache: Record<string, HistoryStack> | null = null;
let entryIdSequence = 0;

function generateEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ph_${crypto.randomUUID()}`;
  }
  entryIdSequence += 1;
  return `ph_${Date.now().toString(36)}_${entryIdSequence.toString(36)}`;
}

function createHistoryEntry(
  value: string,
  options?: { id?: string; pinned?: boolean },
): HistoryEntry {
  return {
    id: options?.id?.trim() ? options.id : generateEntryId(),
    value,
    pinned: options?.pinned === true,
  };
}

function clampMaxEntries(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ENTRIES;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function normalizePersistenceKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeEntry(value: unknown, fallbackValue = ''): HistoryEntry {
  if (typeof value === 'string') {
    return createHistoryEntry(value);
  }
  if (!value || typeof value !== 'object') {
    return createHistoryEntry(fallbackValue);
  }
  const source = value as Partial<{ id: string; value: string; pinned: boolean }>;
  return createHistoryEntry(
    typeof source.value === 'string' ? source.value : fallbackValue,
    {
      id: typeof source.id === 'string' ? source.id : undefined,
      pinned: source.pinned === true,
    },
  );
}

function normalizeHistoryEntries(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeEntry(entry, ''));
}

function normalizeStack(value: unknown, fallbackCurrent: string): HistoryStack {
  if (!value || typeof value !== 'object') {
    return { past: [], future: [], current: createHistoryEntry(fallbackCurrent) };
  }
  const source = value as Partial<HistoryStack>;
  const legacyPast = normalizeEntries((source as unknown as { past?: unknown }).past);
  const legacyFuture = normalizeEntries((source as unknown as { future?: unknown }).future);
  const hasLegacyShape =
    legacyPast.length > 0 ||
    legacyFuture.length > 0 ||
    typeof (source as unknown as { current?: unknown }).current === 'string';

  if (hasLegacyShape) {
    return {
      past: legacyPast.map((entry) => createHistoryEntry(entry)),
      future: legacyFuture.map((entry) => createHistoryEntry(entry)),
      current: createHistoryEntry(
        typeof (source as unknown as { current?: unknown }).current === 'string'
          ? ((source as unknown as { current?: string }).current ?? fallbackCurrent)
          : fallbackCurrent,
      ),
    };
  }

  return {
    past: normalizeHistoryEntries((source as unknown as { past?: unknown }).past),
    future: normalizeHistoryEntries((source as unknown as { future?: unknown }).future),
    current: normalizeEntry((source as unknown as { current?: unknown }).current, fallbackCurrent),
  };
}

function trimUnpinnedEntries(entries: HistoryEntry[], maxEntries: number): HistoryEntry[] {
  const limit = clampMaxEntries(maxEntries);
  let removableCount = entries.filter((entry) => !entry.pinned).length - limit;
  if (removableCount <= 0) return entries;

  const trimmed: HistoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.pinned && removableCount > 0) {
      removableCount -= 1;
      continue;
    }
    trimmed.push(entry);
  }
  return trimmed;
}

function trimStack(stack: HistoryStack, maxEntries: number): HistoryStack {
  stack.past = trimUnpinnedEntries(stack.past, maxEntries);
  stack.future = trimUnpinnedEntries(stack.future, maxEntries);
  return stack;
}

function readPersistedMap(): Record<string, HistoryStack> {
  if (persistedCache) return persistedCache;
  if (typeof window === 'undefined') {
    persistedCache = {};
    return persistedCache;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      persistedCache = {};
      return persistedCache;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      persistedCache = {};
      return persistedCache;
    }

    const normalized: Record<string, HistoryStack> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      normalized[key] = normalizeStack(value, '');
    }
    persistedCache = normalized;
    return persistedCache;
  } catch {
    persistedCache = {};
    return persistedCache;
  }
}

function writePersistedMap(map: Record<string, HistoryStack>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best effort.
  }
}

function loadInitialStack(
  initialValue: string,
  persistenceKey: string | null,
  maxEntries: number,
): HistoryStack {
  if (!persistenceKey) {
    return { past: [], future: [], current: createHistoryEntry(initialValue) };
  }

  const map = readPersistedMap();
  const stored = normalizeStack(map[persistenceKey], initialValue);
  return trimStack(stored, maxEntries);
}

function persistStack(persistenceKey: string | null, stack: HistoryStack, maxEntries: number): void {
  if (!persistenceKey) return;
  const map = readPersistedMap();
  map[persistenceKey] = trimStack(
    {
      past: stack.past.map((entry) => ({ ...entry })),
      future: stack.future.map((entry) => ({ ...entry })),
      current: { ...stack.current },
    },
    maxEntries,
  );
  writePersistedMap(map);
}

function resolveOptions(input?: number | PromptHistoryOptions): Required<Pick<PromptHistoryOptions, 'maxEntries'>> & {
  persistenceKey: string | null;
} {
  if (typeof input === 'number' || input === undefined) {
    return {
      maxEntries: clampMaxEntries(input ?? DEFAULT_MAX_ENTRIES),
      persistenceKey: null,
    };
  }

  return {
    maxEntries: clampMaxEntries(input.maxEntries ?? DEFAULT_MAX_ENTRIES),
    persistenceKey: normalizePersistenceKey(input.persistenceKey),
  };
}

export function usePromptHistory(
  initialValue = '',
  options?: number | PromptHistoryOptions,
): PromptHistoryControls {
  const resolved = resolveOptions(options);
  const maxEntriesRef = useRef(resolved.maxEntries);
  maxEntriesRef.current = resolved.maxEntries;

  const activePersistenceKeyRef = useRef<string | null>(resolved.persistenceKey);
  const ref = useRef<HistoryStack>(
    loadInitialStack(initialValue, resolved.persistenceKey, resolved.maxEntries),
  );

  const persistCurrent = useCallback(() => {
    persistStack(activePersistenceKeyRef.current, ref.current, maxEntriesRef.current);
  }, []);

  useEffect(() => {
    if (activePersistenceKeyRef.current === resolved.persistenceKey) return;
    activePersistenceKeyRef.current = resolved.persistenceKey;
    ref.current = loadInitialStack(initialValue, resolved.persistenceKey, maxEntriesRef.current);
  }, [initialValue, resolved.persistenceKey]);

  useEffect(() => {
    trimStack(ref.current, resolved.maxEntries);
    persistCurrent();
  }, [persistCurrent, resolved.maxEntries]);

  const snapshot = useCallback(
    (value: string) => {
      const s = ref.current;
      if (value === s.current.value) return;
      s.past.push(s.current);
      s.past = trimUnpinnedEntries(s.past, maxEntriesRef.current);
      s.future = [];
      s.current = createHistoryEntry(value);
      persistCurrent();
    },
    [persistCurrent],
  );

  const undo = useCallback((): string | null => {
    const s = ref.current;
    if (s.past.length === 0) return null;
    s.future.push(s.current);
    s.current = s.past.pop()!;
    persistCurrent();
    return s.current.value;
  }, [persistCurrent]);

  const redo = useCallback((): string | null => {
    const s = ref.current;
    if (s.future.length === 0) return null;
    s.past.push(s.current);
    s.current = s.future.pop()!;
    persistCurrent();
    return s.current.value;
  }, [persistCurrent]);

  const canUndo = useCallback(() => ref.current.past.length > 0, []);
  const canRedo = useCallback(() => ref.current.future.length > 0, []);

  const togglePin = useCallback(
    (timelineIndex: number): boolean | null => {
      const s = ref.current;
      const orderedEntries = [...s.past, s.current, ...[...s.future].reverse()];
      const currentIndex = s.past.length;
      if (timelineIndex < 0 || timelineIndex >= orderedEntries.length) return null;

      const target = orderedEntries[timelineIndex];
      const toggled = { ...target, pinned: !target.pinned };
      const nextEntries = orderedEntries.map((entry, idx) => (idx === timelineIndex ? toggled : entry));

      s.past = nextEntries.slice(0, currentIndex);
      s.current = nextEntries[currentIndex];
      s.future = nextEntries.slice(currentIndex + 1).reverse();
      trimStack(s, maxEntriesRef.current);
      persistCurrent();
      return toggled.pinned;
    },
    [persistCurrent],
  );

  const reset = useCallback(
    (value: string) => {
      ref.current = { past: [], future: [], current: createHistoryEntry(value) };
      persistCurrent();
    },
    [persistCurrent],
  );

  const getTimeline = useCallback((): PromptTimeline => {
    const s = ref.current;
    // future is LIFO (most recently undone at end), reverse to get chronological order
    const orderedEntries = [...s.past, s.current, ...[...s.future].reverse()];
    return {
      entries: orderedEntries.map((entry) => entry.value),
      entryIds: orderedEntries.map((entry) => entry.id),
      pinnedByIndex: orderedEntries.map((entry) => entry.pinned),
      pinnedCount: orderedEntries.filter((entry) => entry.pinned).length,
      currentIndex: s.past.length,
    };
  }, []);

  const jumpTo = useCallback(
    (timelineIndex: number): string | null => {
      const s = ref.current;
      const entries = [...s.past, s.current, ...[...s.future].reverse()];
      if (timelineIndex < 0 || timelineIndex >= entries.length) return null;
      if (timelineIndex === s.past.length) return null; // already current

      s.past = entries.slice(0, timelineIndex);
      s.current = entries[timelineIndex];
      s.future = entries.slice(timelineIndex + 1).reverse();
      persistCurrent();
      return s.current.value;
    },
    [persistCurrent],
  );

  return { snapshot, undo, redo, canUndo, canRedo, togglePin, reset, getTimeline, jumpTo };
}
