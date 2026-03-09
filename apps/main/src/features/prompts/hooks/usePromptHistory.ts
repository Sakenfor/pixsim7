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

  return { snapshot, undo, redo, canUndo, canRedo, reset };
}
