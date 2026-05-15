/**
 * Tests for spanProvenanceExtension — the StateField that tracks
 * op-derived spans in the composer with auto-shifting positions.
 *
 * Phase 2b of plan:op-runtime-span-popover. The behavior we care about:
 *  - addSpanProvenance places a marker covering [from, to)
 *  - getSpanProvenance snapshots all markers with current positions
 *  - typing BEFORE a marker shifts its positions forward
 *  - typing INSIDE a marker (overlapping the range) keeps the marker
 *    around with adjusted bounds
 *  - fully deleting a marked range collapses to zero-width and
 *    getSpanProvenance filters it out
 *  - multiple distinct accepts on the same range are kept separate
 *    (eq returns identity, no dedupe)
 */
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import {
  addSpanProvenance,
  clearSpanProvenance,
  getSpanProvenance,
  spanProvenanceField,
  type SpanProvenanceData,
} from '../spanProvenanceExtension';

const SAMPLE_DATA: SpanProvenanceData = {
  block_id: 'core.placement.anchor.left_of',
  source_op: 'scene.relation.place',
  op_params: { relation: 'left_of', distance: 'near' },
  op_refs: { subject: 'character:anne_v3' },
  signature_id: 'scene.relation.v1',
  category: 'location',
  role: 'entities:subject',
};

function makeState(doc: string, extensions: Extension[] = []): EditorState {
  return EditorState.create({
    doc,
    extensions: [spanProvenanceField, ...extensions],
  });
}

function applyAdd(state: EditorState, from: number, to: number, data = SAMPLE_DATA): EditorState {
  return state.update({
    effects: addSpanProvenance.of({ from, to, data }),
  }).state;
}

function applyTextChange(
  state: EditorState,
  from: number,
  to: number,
  insert: string,
): EditorState {
  return state.update({ changes: { from, to, insert } }).state;
}

describe('spanProvenanceExtension', () => {
  it('starts empty', () => {
    const state = makeState('hello world');
    expect(getSpanProvenance(state)).toEqual([]);
  });

  it('captures an added marker at the requested range', () => {
    const state = applyAdd(makeState('hello world'), 6, 11);
    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(1);
    expect(entries[0].start_pos).toBe(6);
    expect(entries[0].end_pos).toBe(11);
    expect(entries[0].block_id).toBe(SAMPLE_DATA.block_id);
    expect(entries[0].source_op).toBe(SAMPLE_DATA.source_op);
    expect(entries[0].op_params).toEqual(SAMPLE_DATA.op_params);
    expect(entries[0].op_refs).toEqual(SAMPLE_DATA.op_refs);
  });

  it('shifts marker positions when text is inserted BEFORE the span', () => {
    let state = makeState('hello world');
    state = applyAdd(state, 6, 11); // marker covers "world"
    // Insert "small " at offset 0 → marker should shift forward by 6.
    state = applyTextChange(state, 0, 0, 'small ');

    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(1);
    expect(entries[0].start_pos).toBe(12);
    expect(entries[0].end_pos).toBe(17);
    expect(state.doc.sliceString(entries[0].start_pos, entries[0].end_pos)).toBe('world');
  });

  it('leaves marker positions alone when text is inserted AFTER the span', () => {
    let state = makeState('hello world');
    state = applyAdd(state, 0, 5); // marker covers "hello"
    state = applyTextChange(state, state.doc.length, state.doc.length, ' suffix');

    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(1);
    expect(entries[0].start_pos).toBe(0);
    expect(entries[0].end_pos).toBe(5);
  });

  it('filters out markers that have collapsed to zero width', () => {
    let state = makeState('hello world');
    state = applyAdd(state, 6, 11); // marker covers "world"
    // Delete the entire "world" — marker collapses to a single point.
    state = applyTextChange(state, 6, 11, '');

    const entries = getSpanProvenance(state);
    expect(entries).toEqual([]);
  });

  it('keeps multiple distinct markers on the same range (eq is identity)', () => {
    let state = makeState('hello world');
    state = applyAdd(state, 6, 11, SAMPLE_DATA);
    state = applyAdd(state, 6, 11, { ...SAMPLE_DATA, source_op: 'scene.relation.other' });

    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(2);
    const ops = entries.map((e) => e.source_op).sort();
    expect(ops).toEqual(['scene.relation.other', 'scene.relation.place']);
  });

  it('keeps separate markers for separate accepts', () => {
    let state = makeState('hello world foo bar');
    state = applyAdd(state, 0, 5, { ...SAMPLE_DATA, block_id: 'first' });
    state = applyAdd(state, 12, 15, { ...SAMPLE_DATA, block_id: 'second' });

    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(2);
    const ids = entries.map((e) => e.block_id).sort();
    expect(ids).toEqual(['first', 'second']);
  });

  it('clearSpanProvenance drops every marker', () => {
    let state = makeState('hello world');
    state = applyAdd(state, 0, 5);
    state = applyAdd(state, 6, 11);
    expect(getSpanProvenance(state)).toHaveLength(2);

    state = state.update({ effects: clearSpanProvenance.of() }).state;
    expect(getSpanProvenance(state)).toEqual([]);
  });

  it('survives the change-then-effect ordering used by handleAcceptOpOutput', () => {
    // PromptComposer dispatches { changes, effects: addSpanProvenance({from: insertFrom, to: insertTo}) }
    // in a single transaction; the marker positions reference the
    // POST-change document. Verify the marker lands on the inserted text.
    let state = makeState('hello world');
    const insertFrom = 6;
    const insertText = 'planet';
    const insertTo = insertFrom + insertText.length;

    state = state.update({
      changes: { from: 6, to: 11, insert: insertText },
      effects: addSpanProvenance.of({ from: insertFrom, to: insertTo, data: SAMPLE_DATA }),
    }).state;

    const entries = getSpanProvenance(state);
    expect(entries).toHaveLength(1);
    expect(entries[0].start_pos).toBe(insertFrom);
    expect(entries[0].end_pos).toBe(insertTo);
    expect(state.doc.sliceString(entries[0].start_pos, entries[0].end_pos)).toBe(insertText);
  });
});
