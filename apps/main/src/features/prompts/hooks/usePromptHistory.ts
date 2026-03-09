/**
 * Ref-based prompt history for undo/redo.
 *
 * Does not trigger re-renders — designed to work alongside controlled
 * components where the parent owns the value and this hook just tracks
 * snapshots for time-travel.
 */

import { useCallback, useRef } from 'react';

interface HistoryStack {
  past: string[];
  future: string[];
  current: string;
}

export interface PromptTimeline {
  /** All entries in chronological order: [...past, current, ...future(oldest-first)] */
  entries: string[];
  /** Index of the current entry in the entries array */
  currentIndex: number;
}

export interface PromptHistoryControls {
  /** Record current value as a history entry (no-op if unchanged) */
  snapshot: (value: string) => void;
  /** Undo — returns restored value or null */
  undo: () => string | null;
  /** Redo — returns restored value or null */
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Reset history with a new baseline */
  reset: (value: string) => void;
  /** Get the full timeline for display (snapshot — not reactive) */
  getTimeline: () => PromptTimeline;
  /** Jump to a specific timeline index — returns the value at that index or null */
  jumpTo: (timelineIndex: number) => string | null;
}

export function usePromptHistory(initialValue = '', maxEntries = 80): PromptHistoryControls {
  const ref = useRef<HistoryStack>({ past: [], future: [], current: initialValue });

  const snapshot = useCallback((value: string) => {
    const s = ref.current;
    if (value === s.current) return;
    s.past.push(s.current);
    if (s.past.length > maxEntries) s.past.shift();
    s.future = [];
    s.current = value;
  }, [maxEntries]);

  const undo = useCallback((): string | null => {
    const s = ref.current;
    if (s.past.length === 0) return null;
    s.future.push(s.current);
    s.current = s.past.pop()!;
    return s.current;
  }, []);

  const redo = useCallback((): string | null => {
    const s = ref.current;
    if (s.future.length === 0) return null;
    s.past.push(s.current);
    s.current = s.future.pop()!;
    return s.current;
  }, []);

  const canUndo = useCallback(() => ref.current.past.length > 0, []);
  const canRedo = useCallback(() => ref.current.future.length > 0, []);

  const reset = useCallback((value: string) => {
    ref.current = { past: [], future: [], current: value };
  }, []);

  const getTimeline = useCallback((): PromptTimeline => {
    const s = ref.current;
    // future is LIFO (most recently undone at end), reverse to get chronological order
    const entries = [...s.past, s.current, ...[...s.future].reverse()];
    return { entries, currentIndex: s.past.length };
  }, []);

  const jumpTo = useCallback((timelineIndex: number): string | null => {
    const s = ref.current;
    const entries = [...s.past, s.current, ...[...s.future].reverse()];
    if (timelineIndex < 0 || timelineIndex >= entries.length) return null;
    if (timelineIndex === s.past.length) return null; // already current

    s.past = entries.slice(0, timelineIndex);
    s.current = entries[timelineIndex];
    s.future = entries.slice(timelineIndex + 1).reverse();
    return s.current;
  }, []);

  return { snapshot, undo, redo, canUndo, canRedo, reset, getTimeline, jumpTo };
}
