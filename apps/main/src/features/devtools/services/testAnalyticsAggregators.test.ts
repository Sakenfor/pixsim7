import { describe, expect, it } from 'vitest';

import {
  filterByWindow,
  getInsightSummary,
  getPassRateByProfile,
  getRunStatusSeries,
  getRunVolumeSeries,
} from './testAnalyticsAggregators';
import type { TestRunSnapshot } from './testOverviewService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(
  overrides: Partial<TestRunSnapshot> & Pick<TestRunSnapshot, 'profileId' | 'status' | 'createdAt'>,
): TestRunSnapshot {
  return {
    id: `snap-${Math.random().toString(36).slice(2, 8)}`,
    profileLabel: overrides.profileId,
    command: `pnpm test:${overrides.profileId}`,
    ...overrides,
  };
}

const NOW = new Date('2026-03-10T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// filterByWindow
// ---------------------------------------------------------------------------

describe('filterByWindow', () => {
  const snapshots: TestRunSnapshot[] = [
    makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(1) }),
    makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: daysAgo(8) }),
    makeSnapshot({ profileId: 'full', status: 'passed', createdAt: daysAgo(20) }),
    makeSnapshot({ profileId: 'full', status: 'skipped', createdAt: daysAgo(35) }),
  ];

  it('returns all snapshots for "all" window', () => {
    expect(filterByWindow(snapshots, 'all', NOW)).toHaveLength(4);
  });

  it('filters to 7d window', () => {
    const result = filterByWindow(snapshots, '7d', NOW);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('passed');
  });

  it('filters to 14d window', () => {
    expect(filterByWindow(snapshots, '14d', NOW)).toHaveLength(2);
  });

  it('filters to 30d window', () => {
    expect(filterByWindow(snapshots, '30d', NOW)).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(filterByWindow([], '7d', NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRunStatusSeries
// ---------------------------------------------------------------------------

describe('getRunStatusSeries', () => {
  const snapshots: TestRunSnapshot[] = [
    makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: '2026-03-09T10:00:00Z' }),
    makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: '2026-03-09T14:00:00Z' }),
    makeSnapshot({ profileId: 'full', status: 'passed', createdAt: '2026-03-08T10:00:00Z' }),
    makeSnapshot({ profileId: 'full', status: 'skipped', createdAt: '2026-03-07T10:00:00Z' }),
  ];

  it('groups by date and counts statuses', () => {
    const series = getRunStatusSeries(snapshots, 'all', undefined, NOW);
    expect(series).toHaveLength(3);

    const mar9 = series.find((p) => p.date === '2026-03-09');
    expect(mar9).toEqual({ date: '2026-03-09', passed: 1, failed: 1, skipped: 0 });

    const mar8 = series.find((p) => p.date === '2026-03-08');
    expect(mar8).toEqual({ date: '2026-03-08', passed: 1, failed: 0, skipped: 0 });

    const mar7 = series.find((p) => p.date === '2026-03-07');
    expect(mar7).toEqual({ date: '2026-03-07', passed: 0, failed: 0, skipped: 1 });
  });

  it('filters by profile', () => {
    const series = getRunStatusSeries(snapshots, 'all', 'fast', NOW);
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual({ date: '2026-03-09', passed: 1, failed: 1, skipped: 0 });
  });

  it('respects time window', () => {
    const series = getRunStatusSeries(snapshots, '7d', undefined, NOW);
    expect(series.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty for no data', () => {
    expect(getRunStatusSeries([], '7d', undefined, NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPassRateByProfile
// ---------------------------------------------------------------------------

describe('getPassRateByProfile', () => {
  const snapshots: TestRunSnapshot[] = [
    makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: daysAgo(1) }),
    makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: daysAgo(2) }),
    makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'failed', createdAt: daysAgo(3) }),
    makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'failed', createdAt: daysAgo(1) }),
    makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'failed', createdAt: daysAgo(2) }),
  ];

  it('computes pass rate per profile', () => {
    const rates = getPassRateByProfile(snapshots, 'all', NOW);
    expect(rates).toHaveLength(2);

    const fast = rates.find((r) => r.profileId === 'fast');
    expect(fast).toBeDefined();
    expect(fast!.total).toBe(3);
    expect(fast!.passed).toBe(2);
    expect(fast!.rate).toBeCloseTo(2 / 3);

    const full = rates.find((r) => r.profileId === 'full');
    expect(full).toBeDefined();
    expect(full!.total).toBe(2);
    expect(full!.passed).toBe(0);
    expect(full!.rate).toBe(0);
  });

  it('sorts by rate descending', () => {
    const rates = getPassRateByProfile(snapshots, 'all', NOW);
    expect(rates[0].profileId).toBe('fast');
    expect(rates[1].profileId).toBe('full');
  });

  it('returns empty for no data', () => {
    expect(getPassRateByProfile([], '7d', NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRunVolumeSeries
// ---------------------------------------------------------------------------

describe('getRunVolumeSeries', () => {
  const snapshots: TestRunSnapshot[] = [
    makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: '2026-03-09T10:00:00Z' }),
    makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: '2026-03-09T14:00:00Z' }),
    makeSnapshot({ profileId: 'full', status: 'passed', createdAt: '2026-03-08T10:00:00Z' }),
  ];

  it('counts runs per day', () => {
    const vol = getRunVolumeSeries(snapshots, 'all', undefined, NOW);
    expect(vol).toHaveLength(2);
    expect(vol.find((v) => v.date === '2026-03-09')?.count).toBe(2);
    expect(vol.find((v) => v.date === '2026-03-08')?.count).toBe(1);
  });

  it('filters by profile', () => {
    const vol = getRunVolumeSeries(snapshots, 'all', 'full', NOW);
    expect(vol).toHaveLength(1);
    expect(vol[0].count).toBe(1);
  });

  it('returns empty for no data', () => {
    expect(getRunVolumeSeries([], '14d', undefined, NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getInsightSummary
// ---------------------------------------------------------------------------

describe('getInsightSummary', () => {
  it('returns null for empty snapshots', () => {
    expect(getInsightSummary([], '7d', NOW)).toBeNull();
  });

  it('computes current rate for "all" window', () => {
    const snapshots: TestRunSnapshot[] = [
      makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(1) }),
      makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: daysAgo(2) }),
    ];
    const insight = getInsightSummary(snapshots, 'all', NOW);
    expect(insight).not.toBeNull();
    expect(insight!.currentRate).toBe(0.5);
    expect(insight!.delta).toBe(0);
    expect(insight!.windowLabel).toBe('all time');
  });

  it('computes delta vs previous period', () => {
    const snapshots: TestRunSnapshot[] = [
      // Current period (0–7d ago): 2 passed, 1 failed → 66.7%
      makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(1) }),
      makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(3) }),
      makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: daysAgo(5) }),
      // Previous period (7–14d ago): 1 passed, 2 failed → 33.3%
      makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(8) }),
      makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: daysAgo(10) }),
      makeSnapshot({ profileId: 'fast', status: 'failed', createdAt: daysAgo(12) }),
    ];
    const insight = getInsightSummary(snapshots, '7d', NOW);
    expect(insight).not.toBeNull();
    expect(insight!.currentRate).toBeCloseTo(2 / 3);
    expect(insight!.previousRate).toBeCloseTo(1 / 3);
    expect(insight!.delta).toBeCloseTo(1 / 3);
    expect(insight!.totalRuns).toBe(3);
  });

  it('returns null when current window has no data', () => {
    const snapshots: TestRunSnapshot[] = [
      makeSnapshot({ profileId: 'fast', status: 'passed', createdAt: daysAgo(20) }),
    ];
    expect(getInsightSummary(snapshots, '7d', NOW)).toBeNull();
  });
});
