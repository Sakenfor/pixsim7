/**
 * useReferenceInput — manages @mention detection on a textarea.
 *
 * Tracks the @ trigger position, extracts the query, and handles
 * inserting the selected reference back into the input text.
 *
 * Usage:
 *   const refs = useReferences();
 *   const refInput = useReferenceInput(refs);
 *
 *   <textarea onInput={refInput.handleInput} onKeyDown={refInput.handleKeyDown} />
 *   <ReferencePicker visible={refInput.active} query={refInput.query} ... onSelect={refInput.select} />
 */
import { useCallback, useRef, useState } from 'react';

import type { ReferenceItem } from './types';

export function useReferenceInput(loader: { load: () => void }) {
  const [query, setQuery] = useState<string | null>(null);
  const triggerPos = useRef(-1);

  const active = query !== null;

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const val = el.value;
      const cursor = el.selectionStart ?? val.length;

      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf('@');
      if (
        atIdx >= 0 &&
        (atIdx === 0 || before[atIdx - 1] === ' ' || before[atIdx - 1] === '\n')
      ) {
        const q = before.slice(atIdx + 1);
        if (!q.includes(' ') && q.length < 40) {
          loader.load();
          setQuery(q);
          triggerPos.current = atIdx;
          return;
        }
      }
      setQuery(null);
    },
    [loader],
  );

  const select = useCallback(
    (item: ReferenceItem, setInput: (fn: (prev: string) => string) => void) => {
      const pos = triggerPos.current;
      if (pos < 0) return;
      const tag = `@${item.type}:${item.id}`;
      setInput((prev) => {
        const afterAt = prev.indexOf(' ', pos + 1);
        const end = afterAt >= 0 ? afterAt : prev.length;
        return prev.slice(0, pos) + tag + ' ' + prev.slice(end);
      });
      setQuery(null);
    },
    [],
  );

  const dismiss = useCallback(() => setQuery(null), []);

  /** Call from textarea onKeyDown — returns true if the event was consumed. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (active && e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return true;
      }
      return false;
    },
    [active],
  );

  return { query: query ?? '', active, handleInput, handleKeyDown, select, dismiss };
}
