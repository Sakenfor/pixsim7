/**
 * Editable UI Core - useUndoRedo Hook
 *
 * Generic undo/redo helper that can be shared between overlay and HUD editors.
 * Uses a single combined state to avoid stale-closure issues with rapid calls.
 */

import { useCallback, useState } from 'react';

export interface UndoRedoState<T> {
  value: T;
  canUndo: boolean;
  canRedo: boolean;
}

export interface UndoRedoControls<T> extends UndoRedoState<T> {
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
}

export interface UseUndoRedoOptions {
  /** Maximum history entries (default: 100) */
  maxHistory?: number;
}

interface HistoryState<T> {
  entries: T[];
  index: number;
}

export function useUndoRedo<T>(initial: T, options: UseUndoRedoOptions = {}): UndoRedoControls<T> {
  const { maxHistory = 100 } = options;

  // Single combined state so functional updaters always see consistent values
  const [state, setState] = useState<HistoryState<T>>({
    entries: [initial],
    index: 0,
  });

  const set = useCallback((next: T) => {
    setState((prev) => {
      // Discard redo branch
      const entries = prev.entries.slice(0, prev.index + 1);
      entries.push(next);
      // Trim if over limit
      if (entries.length > maxHistory) {
        entries.shift();
        return { entries, index: entries.length - 1 };
      }
      return { entries, index: prev.index + 1 };
    });
  }, [maxHistory]);

  const undo = useCallback(() => {
    setState((prev) =>
      prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev
    );
  }, []);

  const redo = useCallback(() => {
    setState((prev) =>
      prev.index < prev.entries.length - 1 ? { ...prev, index: prev.index + 1 } : prev
    );
  }, []);

  const reset = useCallback((next: T) => {
    setState({ entries: [next], index: 0 });
  }, []);

  const value = state.entries[state.index];

  return {
    value,
    canUndo: state.index > 0,
    canRedo: state.index < state.entries.length - 1,
    set,
    undo,
    redo,
    reset,
  };
}
