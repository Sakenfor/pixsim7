import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Extension } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';

import type { ReferencePickerHandle } from '@lib/references';
import type { ReferenceItem } from '@lib/references';

export type CmReferenceInsertMode = 'token' | 'text';

export interface UseCmReferenceInputOptions {
  insertMode?: CmReferenceInsertMode;
}

export function useCmReferenceInput(
  loader: { load: () => void },
  pickerRef: React.RefObject<ReferencePickerHandle | null>,
  editorRef: React.RefObject<EditorView | null>,
  opts?: UseCmReferenceInputOptions,
) {
  const [query, setQuery] = useState<string | null>(null);
  const [triggerPos, setTriggerPos] = useState(-1);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const insertMode = opts?.insertMode ?? 'token';

  const active = query !== null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const queryRef = useRef(query);
  queryRef.current = query;
  const triggerPosRef = useRef(triggerPos);
  triggerPosRef.current = triggerPos;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const pickerRefStable = useRef(pickerRef);
  pickerRefStable.current = pickerRef;

  const extension: Extension = useMemo(() => [
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.docChanged && !update.selectionSet) return;

      const cursor = update.state.selection.main.head;
      // Avoid materializing the whole doc on every keystroke.
      const before = update.state.sliceDoc(0, cursor);
      const atIdx = before.lastIndexOf('@');

      if (
        atIdx >= 0 &&
        (atIdx === 0 || before[atIdx - 1] === ' ' || before[atIdx - 1] === '\n')
      ) {
        const q = before.slice(atIdx + 1);
        if (!q.includes(' ') && q.length < 40) {
          loaderRef.current.load();
          setQuery(q);
          setTriggerPos(atIdx);
          return;
        }
      }
      setQuery(null);
    }),

    EditorView.domEventHandlers({
      keydown: (e) => {
        if (!activeRef.current) return false;

        const picker = pickerRefStable.current?.current;
        if (picker) {
          const syntheticEvent = {
            key: e.key,
            code: e.code,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            altKey: e.altKey,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
            nativeEvent: e,
          };
          if (picker.handleKeyDown(syntheticEvent as React.KeyboardEvent)) {
            e.preventDefault();
            return true;
          }
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setQuery(null);
          return true;
        }
        return false;
      },
    }),
  ], []);

  // Compute anchor coords when trigger activates/moves
  useEffect(() => {
    if (!active || triggerPos < 0) {
      setAnchor(null);
      return;
    }
    const view = editorRef.current;
    if (!view) { setAnchor(null); return; }

    const coords = view.coordsAtPos(triggerPos);
    if (!coords) { setAnchor(null); return; }

    const editorDom = view.dom;
    const container = editorDom.offsetParent as HTMLElement | null;
    if (!container) {
      setAnchor({ top: coords.bottom + 4, left: coords.left });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    setAnchor({
      top: coords.bottom - containerRect.top + 4,
      left: coords.left - containerRect.left,
    });
  }, [active, triggerPos, editorRef]);

  const select = useCallback(
    (item: ReferenceItem, setInput: (fn: (prev: string) => string) => void) => {
      const pos = triggerPosRef.current;
      if (pos < 0) return;
      const useText = item.insertText !== undefined || insertMode === 'text';
      const inserted = useText
        ? (item.insertText ?? item.label)
        : `@${item.type}:${item.id}`;
      const queryLen = (queryRef.current ?? '').length;
      const end = pos + 1 + queryLen;
      setInput((prev) => prev.slice(0, pos) + inserted + ' ' + prev.slice(end));
      setQuery(null);
    },
    [insertMode],
  );

  const dismiss = useCallback(() => setQuery(null), []);

  return { extension, active, query: query ?? '', triggerPos, anchor, select, dismiss };
}
