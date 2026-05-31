import type { ContentPackInfo } from '@pixsim7/shared.api.client/domains';
import { describe, expect, it } from 'vitest';

import {
  UNCATEGORIZED_PACK_CATEGORY,
  groupPackInventoryEntries,
  groupPacksByCategory,
} from '../packCategoryGrouping';

function pack(category: string | null, status: ContentPackInfo['status'] = 'active'): ContentPackInfo {
  return { status, category, blocks: 0, templates: 0, characters: 0 };
}

describe('groupPacksByCategory', () => {
  it('returns empty array for empty input', () => {
    expect(groupPacksByCategory([], () => null)).toEqual([]);
  });

  it('emits known buckets in canonical PACK_CATEGORY_ORDER, skipping empty', () => {
    // Insertion order is intentionally scrambled — output should still be canonical.
    const entries: [string, ContentPackInfo][] = [
      ['mood_a', pack('mood')],
      ['camera_a', pack('camera')],
      ['style_a', pack('style')],
      ['camera_b', pack('camera')],
    ];

    const groups = groupPackInventoryEntries(entries);

    expect(groups.map((g) => g.category)).toEqual(['camera', 'mood', 'style']);
    // Within a group, entry order matches input order.
    expect(groups[0]!.entries.map(([name]) => name)).toEqual(['camera_a', 'camera_b']);
    expect(groups[0]!.label).toBe('Camera');
    expect(groups[0]!.isKnown).toBe(true);
    expect(groups[0]!.isUncategorized).toBe(false);
  });

  it('emits "Uncategorized" group last for null/empty categories', () => {
    const entries: [string, ContentPackInfo][] = [
      ['orphan_a', pack(null)],
      ['camera_a', pack('camera')],
      ['orphan_b', pack('')], // empty string also falls into Uncategorized
      ['mood_a', pack('mood')],
    ];

    const groups = groupPackInventoryEntries(entries);

    expect(groups.map((g) => g.category)).toEqual(['camera', 'mood', UNCATEGORIZED_PACK_CATEGORY]);
    const last = groups.at(-1)!;
    expect(last.label).toBe('Uncategorized');
    expect(last.isUncategorized).toBe(true);
    expect(last.isKnown).toBe(false);
    expect(last.entries.map(([name]) => name)).toEqual(['orphan_a', 'orphan_b']);
  });

  it('puts out-of-registry buckets alphabetically, between known and Uncategorized', () => {
    const entries: [string, ContentPackInfo][] = [
      ['unknown_z', pack('zeta')],
      ['unknown_a', pack('alpha')],
      ['orphan', pack(null)],
      ['camera_a', pack('camera')],
    ];

    const groups = groupPackInventoryEntries(entries);

    expect(groups.map((g) => g.category)).toEqual([
      'camera',
      'alpha',
      'zeta',
      UNCATEGORIZED_PACK_CATEGORY,
    ]);
    const unknownGroup = groups.find((g) => g.category === 'alpha')!;
    expect(unknownGroup.isKnown).toBe(false);
    expect(unknownGroup.isUncategorized).toBe(false);
    expect(unknownGroup.label).toBe('Alpha');
  });

  it('preserves the full 15-bucket canonical order when every bucket is populated', () => {
    const canonical = [
      'camera',
      'lighting',
      'composition',
      'color',
      'subject',
      'expression',
      'anatomy',
      'hands',
      'manner',
      'continuity',
      'latin',
      'mood',
      'scene',
      'style',
      'demo',
    ];
    // Reverse insertion order to prove canonical order is independent of input.
    const entries: [string, ContentPackInfo][] = [...canonical]
      .reverse()
      .map((c) => [`${c}_pack`, pack(c)]);

    const groups = groupPackInventoryEntries(entries);

    expect(groups.map((g) => g.category)).toEqual(canonical);
    expect(groups.every((g) => g.isKnown)).toBe(true);
  });

  it('works on generic entry shapes via getCategory', () => {
    const groups = groupPacksByCategory(
      [
        { id: 'a', cat: 'camera' },
        { id: 'b', cat: null },
        { id: 'c', cat: 'camera' },
      ],
      (e) => e.cat,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups[1]!.category).toBe(UNCATEGORIZED_PACK_CATEGORY);
  });
});
