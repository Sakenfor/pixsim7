import { describe, expect, it } from 'vitest';

import {
  blockIdPrefixMatchesSelection,
  findSelectionAnchor,
  offsetToLineColumn,
} from '../blockMatch';

describe('blockIdPrefixMatchesSelection', () => {
  it('matches the prefix exactly', () => {
    expect(blockIdPrefixMatchesSelection('core.camera.angle', 'core.camera.angle')).toBe(true);
  });

  it('matches when selection extends the prefix with a variant key', () => {
    expect(
      blockIdPrefixMatchesSelection('core.camera.angle', 'core.camera.angle.eye_level'),
    ).toBe(true);
  });

  it('rejects a shorter or unrelated selection', () => {
    expect(blockIdPrefixMatchesSelection('core.camera.angle', 'core.camera')).toBe(false);
    expect(blockIdPrefixMatchesSelection('core.camera.angle', 'core.light.angle')).toBe(false);
  });

  it('rejects a partial prefix that isn\'t followed by a dot', () => {
    // "core.angle_x" must not match selection "core.angle_x_y" — that would
    // be a substring match, not a dotted-segment match.
    expect(blockIdPrefixMatchesSelection('core.angle', 'core.angle_x.foo')).toBe(false);
  });

  it('returns false for null/empty inputs', () => {
    expect(blockIdPrefixMatchesSelection(null, 'a.b')).toBe(false);
    expect(blockIdPrefixMatchesSelection('a.b', null)).toBe(false);
    expect(blockIdPrefixMatchesSelection('', 'a.b')).toBe(false);
  });
});

describe('findSelectionAnchor', () => {
  const source = `pack: {
  blocks: [{
    id: "angle"
    block_schema: {
      id_prefix: "core.camera.angle"
      variants: [{key: "eye_level"}]
    }
  }]
}`;

  it('locates an id_prefix that matches the selection plus a variant suffix', () => {
    const anchor = findSelectionAnchor(source, 'core.camera.angle.eye_level');
    expect(anchor).not.toBeNull();
    expect(anchor?.matched).toBe('core.camera.angle');
    expect(source.slice(anchor!.offset, anchor!.offset + 17)).toBe('core.camera.angle');
  });

  it('locates the selection exactly when present verbatim', () => {
    const exact = `pack: { blocks: [{ id: "foo", block_schema: { id_prefix: "a.b.c.d" } }] }`;
    const anchor = findSelectionAnchor(exact, 'a.b.c.d');
    expect(anchor?.matched).toBe('a.b.c.d');
  });

  it('returns null when no prefix of length >= 2 is present', () => {
    expect(findSelectionAnchor(source, 'other.pack.thing')).toBeNull();
  });

  it('returns null when inputs are empty', () => {
    expect(findSelectionAnchor('', 'a.b')).toBeNull();
    expect(findSelectionAnchor('text', null)).toBeNull();
  });

  it('walks back segment-by-segment, not character-by-character', () => {
    // Selection "a.bb.cc" should NOT match a source mentioning just "a.b"
    // (because "a.b" is not a dotted prefix of "a.bb.cc").
    const src = `id_prefix: "a.b"`;
    const anchor = findSelectionAnchor(src, 'a.bb.cc');
    expect(anchor).toBeNull();
  });
});

describe('offsetToLineColumn', () => {
  it('returns 1-based line and column for the start of file', () => {
    expect(offsetToLineColumn('hello', 0)).toEqual({ line: 1, column: 1 });
  });

  it('handles single-line offsets', () => {
    expect(offsetToLineColumn('hello world', 6)).toEqual({ line: 1, column: 7 });
  });

  it('counts newlines correctly', () => {
    const src = 'a\nbb\nccc';
    expect(offsetToLineColumn(src, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineColumn(src, 2)).toEqual({ line: 2, column: 1 });
    expect(offsetToLineColumn(src, 5)).toEqual({ line: 3, column: 1 });
    expect(offsetToLineColumn(src, 7)).toEqual({ line: 3, column: 3 });
  });
});
