import type { Extension } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { getViewportAwarePopupPosition } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

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
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);
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
      // Cap the search window — query must be < 40 chars without spaces, so
      // the @ can't be more than ~40 chars before cursor. 50 gives margin.
      const windowStart = Math.max(0, cursor - 50);
      const window = update.state.sliceDoc(windowStart, cursor);
      const atIdxInWindow = window.lastIndexOf('@');

      if (atIdxInWindow >= 0) {
        const atIdx = windowStart + atIdxInWindow;
        const charBefore =
          atIdx === 0
            ? null
            : update.state.sliceDoc(atIdx - 1, atIdx);
        if (atIdx === 0 || charBefore === ' ' || charBefore === '\n') {
          const q = window.slice(atIdxInWindow + 1);
          if (!q.includes(' ') && q.length < 40) {
            loaderRef.current.load();
            setQuery(q);
            setTriggerPos(atIdx);
            return;
          }
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

    // Viewport-relative coordinates so callers can render the picker in a
    // portal at document.body level (escaping local stacking contexts).
    const containerRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const { style } = getViewportAwarePopupPosition({
      anchorRect: coords,
      containerRect,
      popupWidth: 288,
      popupMaxHeight: 320,
      preferredPlacement: 'bottom',
      offset: 4,
      viewportMargin: 8,
    });
    setAnchor(style);
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
