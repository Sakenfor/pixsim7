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

  it('returns stable ranges for clause-level additions with newlines', () => {
    const prev = 'Wide shot, warm light.\nSubject smiles.';
    const next = 'Wide shot, warm light.\nSubject smiles.\nCamera pushes in.';

    const segments = diffPromptWithRanges(prev, next);
    const added = segments.filter((segment) => segment.type === 'add');

    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('Camera pushes in.');
    expect(added[0].from).toBeDefined();
    expect(added[0].to).toBeDefined();
    expect(next.slice(added[0].from!, added[0].to!)).toBe('Camera pushes in.');
  });
});
