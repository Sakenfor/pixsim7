import { describe, expect, it } from 'vitest';

import { diffPromptWithRanges } from '../promptDiff';

describe('diffPromptWithRanges', () => {
  it('anchors repeated-word additions to the correct occurrence', () => {
    const prev = 'alpha beta gamma';
    const next = 'alpha beta gamma beta';

    const segments = diffPromptWithRanges(prev, next);
    const added = segments.filter((segment) => segment.type === 'add');

    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('beta');
    expect(added[0].from).toBeDefined();
    expect(added[0].to).toBeDefined();
    expect(next.slice(added[0].from!, added[0].to!)).toBe('beta');
    expect(added[0].from).toBe(next.lastIndexOf('beta'));
  });

  it('returns stable ranges for word-level additions with newlines', () => {
    const prev = 'Wide shot, warm light.\nSubject smiles.';
    const next = 'Wide shot, warm light.\nSubject smiles.\nCamera pushes in.';

    const segments = diffPromptWithRanges(prev, next);
    const added = segments.filter((segment) => segment.type === 'add');
    const first = added[0];
    const last = added[added.length - 1];

    expect(added.map((segment) => segment.text)).toEqual(['Camera', 'pushes', 'in.']);
    expect(first.from).toBeDefined();
    expect(last.to).toBeDefined();
    expect(next.slice(first.from!, last.to!)).toBe('Camera pushes in.');
    for (const segment of added) {
      expect(segment.from).toBeDefined();
      expect(segment.to).toBeDefined();
      expect(next.slice(segment.from!, segment.to!)).toBe(segment.text);
    }
  });

  it('pinpoints intra-word edits instead of highlighting the whole token', () => {
    const prev = 'soft lighting on subject';
    const next = 'soft lightning on subject';

    const segments = diffPromptWithRanges(prev, next);
    const added = segments.filter((segment) => segment.type === 'add');
    const removed = segments.filter((segment) => segment.type === 'remove');

    expect(added.map((segment) => segment.text)).toEqual(['n']);
    expect(removed).toHaveLength(0);
    expect(added[0].from).toBeDefined();
    expect(added[0].to).toBeDefined();
    expect(next.slice(added[0].from!, added[0].to!)).toBe('n');
  });
});
