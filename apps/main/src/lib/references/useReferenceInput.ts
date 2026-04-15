/**
 * useReferenceInput — manages @mention detection on a textarea.
 *
 * Tracks the @ trigger position, extracts the query, and handles
 * inserting the selected reference back into the input text.
 *
 * Usage:
 *   const refs = useReferences();
 *   const pickerRef = useRef<ReferencePickerHandle>(null);
 *   const refInput = useReferenceInput(refs, pickerRef);
 *
 *   <textarea onInput={refInput.handleInput} onKeyDown={refInput.handleKeyDown} />
 *   <ReferencePicker ref={pickerRef} visible={refInput.active} query={refInput.query} ... />
 *
 * Insertion modes:
 *   - 'token' (default): inserts `@{type}:{id}` — for entity references that
 *     get resolved later (plans, worlds, projects).
 *   - 'text': inserts a plain word (item.insertText ?? item.label) — for
 *     vocabulary references like anatomy parts where the text itself is the
 *     payload and no post-hoc resolution is needed.
 *   - A source can override per-item via the optional `insertText` field on
 *     ReferenceItem. If `insertMode` is 'token' but the item has `insertText`,
 *     text mode still wins for that item (explicit override).
 */
import { useCallback, useState } from 'react';

import type { ReferencePickerHandle } from './ReferencePicker';
import type { ReferenceItem } from './types';

export type ReferenceInsertMode = 'token' | 'text';

export function useReferenceInput(
  loader: { load: () => void },
  pickerRef?: React.RefObject<ReferencePickerHandle | null>,
  opts?: { insertMode?: ReferenceInsertMode },
) {
  const [query, setQuery] = useState<string | null>(null);
  // Index of the `@` in the textarea that triggered the picker. Tracked in
  // state (not a ref) so consumers can anchor UI like caret-positioned
  // popups to its position via an effect.
  const [triggerPos, setTriggerPos] = useState(-1);
  const insertMode = opts?.insertMode ?? 'token';

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
          setTriggerPos(atIdx);
          return;
        }
      }
      setQuery(null);
    },
    [loader],
  );

  const select = useCallback(
    (item: ReferenceItem, setInput: (fn: (prev: string) => string) => void) => {
      const pos = triggerPos;
      if (pos < 0) return;
      // Per-item override beats the hook-level mode so a source can mix
      // token-style refs with plain-text completions in the same picker.
      const useText = item.insertText !== undefined || insertMode === 'text';
      const inserted = useText
        ? (item.insertText ?? item.label)
        : `@${item.type}:${item.id}`;
      // Replace exactly `@` + the tracked query length. Previously we looked
      // for the next literal space — but `\n`, `\t`, etc. aren't spaces, so
      // on multi-line input the replacement could leap past a newline and
      // clobber content on following lines. The query length is the
      // authoritative width of what the user typed after the `@`.
      const queryLen = (query ?? '').length;
      const end = pos + 1 + queryLen;
      setInput((prev) => prev.slice(0, pos) + inserted + ' ' + prev.slice(end));
      setQuery(null);
    },
    [insertMode, triggerPos, query],
  );

  const dismiss = useCallback(() => setQuery(null), []);

  /** Call from textarea onKeyDown — returns true if the event was consumed. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!active) return false;
      // Delegate to picker for arrow/enter/escape navigation
      if (pickerRef?.current?.handleKeyDown(e)) return true;
      // Fallback Escape if picker didn't handle it
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return true;
      }
      return false;
    },
    [active, pickerRef],
  );

  return { query: query ?? '', active, triggerPos, handleInput, handleKeyDown, select, dismiss };
}
