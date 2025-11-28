/**
 * Editable UI Core - useUndoRedo Hook
 *
 * Generic undo/redo helper that can be shared between overlay and HUD editors.
 * This is intentionally minimal and can be extended as needed.
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

export function useUndoRedo<T>(initial: T): UndoRedoControls<T> {
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const set = useCallback((next: T) => {
    setHistory(prev => {
      const sliced = prev.slice(0, index + 1);
      return [...sliced, next];
    });
    setIndex(prev => prev + 1);
  }, [index]);

  const undo = useCallback(() => {
    setIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const redo = useCallback(() => {
    setIndex(prev => (prev < history.length - 1 ? prev + 1 : prev));
  }, [history.length]);

  const reset = useCallback((next: T) => {
    setHistory([next]);
    setIndex(0);
  }, []);

  const value = history[index];

  return {
    value,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
    set,
    undo,
    redo,
    reset,
  };
}

