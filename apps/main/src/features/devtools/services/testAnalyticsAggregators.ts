/**
 * Pure analytics aggregators for test run snapshots.
 * No side effects — all functions are unit-testable with synthetic data.
 */
import type { TestRunSnapshot } from './testOverviewService';

export type TimeWindow = '7d' | '14d' | '30d' | 'all';

export interface StatusSeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  passed: number;
  failed: number;
  skipped: number;
}

export interface ProfilePassRate {
  profileId: string;
  profileLabel: string;
  total: number;
  passed: number;
  /** 0–1 */
  rate: number;
}

export interface VolumeSeriesPoint {
  date: string;
  count: number;
}

export interface InsightSummary {
  currentRate: number;
  previousRate: number;
  delta: number;
  totalRuns: number;
  windowLabel: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function windowToDays(window: TimeWindow): number | null {
  if (window === '7d') return 7;
  if (window === '14d') return 14;
  if (window === '30d') return 30;
  return null;
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function buildDateRange(snapshots: TestRunSnapshot[]): string[] {
  if (snapshots.length === 0) return [];
  const dates = snapshots.map((s) => toDateKey(s.createdAt));
  const sorted = [...new Set(dates)].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  const range: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    range.push(d.toISOString().slice(0, 10));
  }
  return range;
}

// ---------------------------------------------------------------------------
// Public aggregators
// ---------------------------------------------------------------------------

export function filterByWindow(
  snapshots: TestRunSnapshot[],
  window: TimeWindow,
  now: Date = new Date(),
): TestRunSnapshot[] {
  const days = windowToDays(window);
  if (days === null) return snapshots;
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return snapshots.filter((s) => new Date(s.createdAt) >= cutoff);
}

export function getRunStatusSeries(
  snapshots: TestRunSnapshot[],
  window: TimeWindow,
  profile?: string,
  now?: Date,
): StatusSeriesPoint[] {
  let filtered = filterByWindow(snapshots, window, now);
  if (profile) {
    filtered = filtered.filter((s) => s.profileId === profile);
  }
  const dateRange = buildDateRange(filtered);
  const buckets = new Map<string, StatusSeriesPoint>();
  for (const date of dateRange) {
    buckets.set(date, { date, passed: 0, failed: 0, skipped: 0 });
  }
  for (const snap of filtered) {
    const key = toDateKey(snap.createdAt);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { date: key, passed: 0, failed: 0, skipped: 0 };
      buckets.set(key, bucket);
    }
    bucket[snap.status]++;
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getPassRateByProfile(
  snapshots: TestRunSnapshot[],
  window: TimeWindow,
  now?: Date,
): ProfilePassRate[] {
  const filtered = filterByWindow(snapshots, window, now);
  const map = new Map<string, { label: string; total: number; passed: number }>();
  for (const snap of filtered) {
    let entry = map.get(snap.profileId);
    if (!entry) {
      entry = { label: snap.profileLabel, total: 0, passed: 0 };
      map.set(snap.profileId, entry);
    }
    entry.total++;
    if (snap.status === 'passed') {
      entry.passed++;
    }
  }
  return [...map.entries()]
    .map(([profileId, { label, total, passed }]) => ({
      profileId,
      profileLabel: label,
      total,
      passed,
      rate: total > 0 ? passed / total : 0,
    }))
    .sort((a, b) => b.rate - a.rate || a.profileLabel.localeCompare(b.profileLabel));
}

export function getRunVolumeSeries(
  snapshots: TestRunSnapshot[],
  window: TimeWindow,
  profile?: string,
  now?: Date,
): VolumeSeriesPoint[] {
  let filtered = filterByWindow(snapshots, window, now);
  if (profile) {
    filtered = filtered.filter((s) => s.profileId === profile);
  }
  const dateRange = buildDateRange(filtered);
  const buckets = new Map<string, number>();
  for (const date of dateRange) {
    buckets.set(date, 0);
  }
  for (const snap of filtered) {
    const key = toDateKey(snap.createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getInsightSummary(
  snapshots: TestRunSnapshot[],
  window: TimeWindow,
  now: Date = new Date(),
): InsightSummary | null {
  const days = windowToDays(window);
  if (days === null) {
    if (snapshots.length === 0) return null;
    const passed = snapshots.filter((s) => s.status === 'passed').length;
    return {
      currentRate: passed / snapshots.length,
      previousRate: 0,
      delta: 0,
      totalRuns: snapshots.length,
      windowLabel: 'all time',
    };
  }

  const currentCutoff = new Date(now.getTime() - days * 86_400_000);
  const previousCutoff = new Date(now.getTime() - days * 2 * 86_400_000);

  const current = snapshots.filter((s) => new Date(s.createdAt) >= currentCutoff);
  const previous = snapshots.filter((s) => {
    const d = new Date(s.createdAt);
    return d >= previousCutoff && d < currentCutoff;
  });

  if (current.length === 0) return null;

  const currentPassed = current.filter((s) => s.status === 'passed').length;
  const currentRate = currentPassed / current.length;

  let previousRate = 0;
  let delta = 0;
  if (previous.length > 0) {
    const previousPassed = previous.filter((s) => s.status === 'passed').length;
    previousRate = previousPassed / previous.length;
    delta = currentRate - previousRate;
  }

  const labels: Record<string, string> = { '7d': '7d', '14d': '14d', '30d': '30d' };
  return {
    currentRate,
    previousRate,
    delta,
    totalRuns: current.length,
    windowLabel: labels[window] ?? window,
  };
}
