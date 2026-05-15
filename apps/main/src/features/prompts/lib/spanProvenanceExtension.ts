/**
 * Span provenance — CodeMirror StateField that tracks which prompt
 * spans were inserted via the runtime op executor (Adjust tab in the
 * span popover) and what op produced them.
 *
 * Phase 2b of plan:op-runtime-span-popover. Live position tracking:
 * the StateField holds a RangeSet of provenance markers that auto-shift
 * with document changes — when the user types before an op-derived
 * span, the entry's recorded position moves with it. When the user
 * fully deletes the span the marker collapses to a zero-width range
 * and is filtered out by `getSpanProvenance()`.
 *
 * Wire in PromptComposer:
 *   1. Include `spanProvenanceField` in the editor's extensions list.
 *   2. On `handleAcceptOpOutput`, dispatch `addSpanProvenance` alongside
 *      the changes spec so the marker lands at the inserted range.
 *   3. On save (or via `useSpanProvenance` subscriber), call
 *      `getSpanProvenance(view.state)` to snapshot the current entries
 *      and ship them with the prompt save payload.
 */
import {
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** The provenance metadata we attach to each op-derived span. Mirrors
 *  the OpExecuteOverlayEntry shape from /prompts/operations/execute,
 *  minus the `text` field (the doc IS the text). */
export interface SpanProvenanceData {
  block_id: string;
  source_op: string;
  op_params: Record<string, unknown>;
  /** Canonical-token-form refs (asset:N | character:slug | role:X | symbol:Y).
   *  Already normalized by the backend executor. */
  op_refs: Record<string, string>;
  signature_id: string | null;
  category: string | null;
  role: string | null;
}

/** Snapshot entry returned to consumers. Position fields reflect where
 *  the span CURRENTLY lives in the document — they may differ from
 *  where it was inserted if the user has edited around it. */
export interface SpanProvenanceEntry extends SpanProvenanceData {
  start_pos: number;
  end_pos: number;
}

class ProvenanceMarker extends RangeValue {
  constructor(public readonly data: SpanProvenanceData) {
    super();
  }

  // Each marker is unique (different op invocation = different entry,
  // even if data happens to be equal). Identity equality avoids
  // range-set dedupe collapsing two distinct accepts that landed on
  // the same range.
  override eq(other: RangeValue): boolean {
    return other === this;
  }
}

export const addSpanProvenance = StateEffect.define<{
  from: number;
  to: number;
  data: SpanProvenanceData;
}>();

export const clearSpanProvenance = StateEffect.define<void>();

export const spanProvenanceField = StateField.define<RangeSet<ProvenanceMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    if (tr.docChanged) {
      set = set.map(tr.changes);
    }
    for (const effect of tr.effects) {
      if (effect.is(addSpanProvenance)) {
        const { from, to, data } = effect.value;
        set = set.update({
          add: [new ProvenanceMarker(data).range(from, to)],
        });
      } else if (effect.is(clearSpanProvenance)) {
        set = RangeSet.empty;
      }
    }
    return set;
  },
});

/** Snapshot the current provenance entries from the editor state.
 *  Filters out collapsed (zero-width) markers — those mean the user
 *  fully deleted an op-derived span, so the provenance is no longer
 *  meaningful. */
export function getSpanProvenance(state: EditorState): SpanProvenanceEntry[] {
  const set = state.field(spanProvenanceField, false);
  if (!set) return [];
  const entries: SpanProvenanceEntry[] = [];
  // RangeCursor gives us each marker; iterate manually so we can keep
  // the marker reference alongside its current positions.
  const cursor = set.iter();
  while (cursor.value !== null) {
    if (cursor.from < cursor.to) {
      entries.push({
        start_pos: cursor.from,
        end_pos: cursor.to,
        ...cursor.value.data,
      });
    }
    cursor.next();
  }
  return entries;
}

/** Convenience: dispatch the add effect onto a view. */
export function dispatchAddSpanProvenance(
  view: EditorView,
  args: { from: number; to: number; data: SpanProvenanceData },
): void {
  view.dispatch({ effects: addSpanProvenance.of(args) });
}
