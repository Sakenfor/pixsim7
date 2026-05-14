/**
 * Chat Timestamp Helper Tests
 *
 * Covers the pure helpers exported from ChatMessageComponents that drive
 * the per-bubble HH:MM stamp, the verbose hover tooltip, and the day-
 * divider label. The helpers are locale-aware via Intl — these tests
 * pin behavior in en-US (set as the vitest setup env locale) so the
 * formatting strings stay deterministic across CI hosts.
 */

export const TEST_SUITE = {
  id: 'assistant-chat-timestamps',
  label: 'AI Assistant Chat Timestamps',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'rendering',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/ChatMessageComponents.tsx'],
  order: 40.3,
};

import { describe, it, expect } from 'vitest';

import {
  toDate,
  formatMessageTime,
  formatMessageTitle,
  isSameLocalDay,
  formatDayDivider,
} from '../ChatMessageComponents';

describe('toDate', () => {
  it('passes Date through', () => {
    const d = new Date('2026-05-10T14:35:00');
    expect(toDate(d)).toBe(d);
  });

  it('parses ISO strings', () => {
    const d = toDate('2026-05-10T14:35:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getUTCHours()).toBe(14);
  });

  it('returns null for null/undefined/invalid', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('not-a-date')).toBeNull();
  });
});

describe('formatMessageTime', () => {
  it('renders HH:MM in 24h form', () => {
    // Construct in local time so the assertion isn't tz-sensitive.
    const d = new Date(2026, 4, 10, 14, 35, 12);
    expect(formatMessageTime(d)).toBe('14:35');
  });

  it('pads single-digit hours and minutes', () => {
    const d = new Date(2026, 4, 10, 3, 7, 0);
    expect(formatMessageTime(d)).toBe('03:07');
  });

  it('returns empty string for missing/invalid', () => {
    expect(formatMessageTime(null)).toBe('');
    expect(formatMessageTime(undefined)).toBe('');
    expect(formatMessageTime('garbage')).toBe('');
  });
});

describe('formatMessageTitle', () => {
  it('includes seconds + weekday + year for hover tooltip', () => {
    const d = new Date(2026, 4, 10, 14, 35, 12);
    const title = formatMessageTitle(d);
    // Sanity-check the key components are present without pinning the
    // exact separators (Intl varies by host locale data version).
    expect(title).toMatch(/2026/);
    expect(title).toMatch(/14:35:12/);
  });

  it('returns empty string when missing', () => {
    expect(formatMessageTitle(null)).toBe('');
  });
});

describe('isSameLocalDay', () => {
  it('matches identical days regardless of time', () => {
    const a = new Date(2026, 4, 10, 0, 0, 1);
    const b = new Date(2026, 4, 10, 23, 59, 58);
    expect(isSameLocalDay(a, b)).toBe(true);
  });

  it('rejects adjacent days', () => {
    const a = new Date(2026, 4, 10, 23, 59, 59);
    const b = new Date(2026, 4, 11, 0, 0, 0);
    expect(isSameLocalDay(a, b)).toBe(false);
  });

  it('rejects same day-of-month in different months', () => {
    const a = new Date(2026, 3, 10);
    const b = new Date(2026, 4, 10);
    expect(isSameLocalDay(a, b)).toBe(false);
  });
});

describe('formatDayDivider', () => {
  // Pin "now" so Today/Yesterday tests are deterministic.
  const now = new Date(2026, 4, 10, 12, 0, 0); // Sunday May 10, 2026, noon

  it('returns "Today" when same calendar day as now', () => {
    expect(formatDayDivider(new Date(2026, 4, 10, 0, 0, 1), now)).toBe('Today');
    expect(formatDayDivider(new Date(2026, 4, 10, 23, 59, 59), now)).toBe('Today');
  });

  it('returns "Yesterday" for the previous calendar day', () => {
    expect(formatDayDivider(new Date(2026, 4, 9, 18, 0, 0), now)).toBe('Yesterday');
  });

  it('returns a same-year weekday/month label for older days', () => {
    const out = formatDayDivider(new Date(2026, 0, 15, 12, 0, 0), now);
    expect(out).toMatch(/January/);
    expect(out).toMatch(/15/);
    expect(out).not.toMatch(/2026/); // year omitted in same-year case
  });

  it('includes the year when day is in a different year', () => {
    const out = formatDayDivider(new Date(2024, 11, 25, 12, 0, 0), now);
    expect(out).toMatch(/2024/);
    expect(out).toMatch(/December/);
  });

  it('crosses year boundary correctly (Yesterday on Jan 1)', () => {
    const nye = new Date(2027, 0, 1, 8, 0, 0);
    expect(formatDayDivider(new Date(2026, 11, 31, 22, 0, 0), nye)).toBe('Yesterday');
  });
});
