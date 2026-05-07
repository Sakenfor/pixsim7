import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRecentPrompts } from '../recentPrompts';

const STORAGE_KEY = 'prompt_draft_history_v1';

function setStorage(value: unknown) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

describe('readRecentPrompts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns [] when storage is empty', () => {
    expect(readRecentPrompts()).toEqual([]);
  });

  it('returns [] when storage is malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readRecentPrompts()).toEqual([]);
  });

  it('returns [] when stored value is not a record', () => {
    setStorage([1, 2, 3]);
    expect(readRecentPrompts()).toEqual([]);
  });

  it('reads current then past entries from each scope, dedupes by value, caps at limit', () => {
    setStorage({
      quickGen: {
        current: { id: 'a', value: 'cat sitting', pinned: false },
        past: [
          { id: 'b', value: 'dog running', pinned: false },
          { id: 'c', value: 'bird flying', pinned: true },
        ],
      },
      'template:foo': {
        current: { id: 'd', value: 'cat sitting', pinned: false }, // duplicate value
        past: [{ id: 'e', value: 'fish swimming', pinned: false }],
      },
    });

    const result = readRecentPrompts(10);
    expect(result.map((p) => p.value)).toEqual([
      'cat sitting',
      // past order is reverse-chrono per scope: c (newest in past list) → b
      'bird flying',
      'dog running',
      // template:foo's current (cat sitting) is dupe-skipped
      'fish swimming',
    ]);
    expect(result[0].scope).toBe('quickGen');
    expect(result[1].pinned).toBe(true);
  });

  it('honours the limit parameter', () => {
    setStorage({
      a: {
        current: { id: '1', value: 'one', pinned: false },
        past: [
          { id: '2', value: 'two', pinned: false },
          { id: '3', value: 'three', pinned: false },
          { id: '4', value: 'four', pinned: false },
        ],
      },
    });
    expect(readRecentPrompts(2)).toHaveLength(2);
  });

  it('skips entries with non-string, empty, or whitespace-only value', () => {
    setStorage({
      a: {
        current: { id: '1', value: '', pinned: false },
        past: [
          { id: '2', value: '   ', pinned: false }, // whitespace-only → dropped
          { id: '3', value: 42, pinned: false },     // non-string → dropped
          { id: '4', value: 'real', pinned: false },
        ],
      },
    });
    const result = readRecentPrompts();
    expect(result.map((p) => p.value)).toEqual(['real']);
  });

  it('falls back to a synthetic id when entry is missing one', () => {
    setStorage({
      scopeA: {
        current: { value: 'no id here' },
      },
    });
    const result = readRecentPrompts();
    expect(result[0].id).toBe('scopeA:no id here');
  });
});
