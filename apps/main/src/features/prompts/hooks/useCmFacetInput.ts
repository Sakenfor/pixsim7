import type { Extension } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { getViewportAwarePopupPosition } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { ReferencePickerHandle } from '@lib/references';

import {
  FACET_TRIGGER_WINDOW,
  matchFacetTrigger,
  type CmFacetTrigger,
} from '../lib/facetTrigger';

/**
 * useCmFacetInput — facet autocomplete for the intra-token `_` access operator.
 *
 * Sibling to `useCmReferenceInput` (the `@mention` picker). Where that triggers
 * on `@`, this triggers when the caret sits right after `ENTITY_<partial>` — an
 * uppercase variable whose class declares facet axes (ACTOR, SCENE, …). The
 * host feeds `suggestFacets(className, partial, vocab)` into a `ReferencePicker`
 * and calls `complete(value)` to splice the chosen facet token in.
 *
 * Only recognised classes arm the trigger (facetless classes like GOAL never
 * autocomplete), so prose like `follow_up` stays inert. Trigger detection is
 * the pure `matchFacetTrigger` (see `lib/facetTrigger`).
 */

export function useCmFacetInput(
  pickerRef: React.RefObject<ReferencePickerHandle | null>,
  editorRef: React.RefObject<EditorView | null>,
) {
  const [trigger, setTrigger] = useState<CmFacetTrigger | null>(null);
  // Doc offset where the partial begins (right after the `_`) — splice anchor.
  const [triggerPos, setTriggerPos] = useState(-1);
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);

  const active = trigger !== null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const triggerRef = useRef(trigger);
  triggerRef.current = trigger;
  const triggerPosRef = useRef(triggerPos);
  triggerPosRef.current = triggerPos;
  const pickerRefStable = useRef(pickerRef);
  pickerRefStable.current = pickerRef;

  const extension: Extension = useMemo(() => [
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.docChanged && !update.selectionSet) return;

      const cursor = update.state.selection.main.head;
      const windowStart = Math.max(0, cursor - FACET_TRIGGER_WINDOW);
      const text = update.state.sliceDoc(windowStart, cursor);
      const hit = matchFacetTrigger(text);
      if (hit) {
        // Only OPEN the autocomplete on actual typing. A bare caret move (a
        // click into, or arrowing through, an already-complete `ENTITY_FACET`
        // token) must not pop the picker — otherwise clicking a facet shows the
        // search alongside the variable popover. A caret move may still keep an
        // already-open session in sync as you reposition within the partial.
        if (update.docChanged || activeRef.current) {
          setTrigger({ className: hit.className, partial: hit.partial });
          setTriggerPos(windowStart + hit.partialStart);
        }
        return;
      }
      setTrigger(null);
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
          setTrigger(null);
          return true;
        }
        return false;
      },
    }),
  ], []);

  // Anchor coords at the partial start (under the `_`), recomputed as it moves.
  useEffect(() => {
    if (!active || triggerPos < 0) {
      setAnchor(null);
      return;
    }
    const view = editorRef.current;
    if (!view) { setAnchor(null); return; }

    const coords = view.coordsAtPos(triggerPos);
    if (!coords) { setAnchor(null); return; }

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

  /** Splice the chosen facet token in: replace the partial with `value` (the
   *  uppercase facet token) plus a trailing space, which also closes the picker
   *  (the trailing space breaks the trigger regex). */
  const complete = useCallback(
    (value: string, setInput: (fn: (prev: string) => string) => void) => {
      const pos = triggerPosRef.current;
      if (pos < 0) return;
      const partialLen = (triggerRef.current?.partial ?? '').length;
      const end = pos + partialLen;
      setInput((prev) => prev.slice(0, pos) + value + ' ' + prev.slice(end));
      setTrigger(null);
    },
    [],
  );

  const dismiss = useCallback(() => setTrigger(null), []);

  return {
    extension,
    active,
    className: trigger?.className ?? '',
    partial: trigger?.partial ?? '',
    triggerPos,
    anchor,
    complete,
    dismiss,
  };
}
