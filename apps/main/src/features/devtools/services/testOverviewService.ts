import {
  ensureBuiltInTestCatalogRegistered,
  registerTestCatalogPlugin,
  registerTestProfile,
  registerTestSuite,
  testProfileRegistry,
  testSuiteRegistry,
  type TestCatalogPlugin,
  type TestProfileDefinition,
  type TestProfileId,
  type TestSuiteDefinition,
} from './testCatalogRegistry';

export type { TestCatalogPlugin, TestProfileDefinition, TestProfileId, TestSuiteDefinition };

export type TestRunStatus = 'passed' | 'failed' | 'skipped';
export type TimeWindow = '7d' | '14d' | '30d' | 'all';

export interface TestAnalyticsOptions {
  window?: TimeWindow;
  profileId?: string;
  now?: Date;
}

export interface StatusSeriesPoint {
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
  rate: number;
}

export interface RunVolumeSeriesPoint {
  date: string;
  count: number;
}

export interface TestOverview {
  profiles: TestProfileDefinition[];
  suites: TestSuiteDefinition[];
  docs: string[];
}

export interface TestRunSnapshot {
  id: string;
  profileId: TestProfileId;
  profileLabel: string;
  command: string;
  status: TestRunStatus;
  createdAt: string;
}

const TEST_RUNS_STORAGE_KEY = 'pixsim7:devtools:test-runs:v1';
const MAX_SNAPSHOTS = 60;
const DAY_IN_MS = 86_400_000;

const TEST_DOCS = [
  'docs/testing/TEST_OVERVIEW.md',
  'scripts/tests/README.md',
  'scripts/tests/run.py',
  'pytest.ini',
];

let fallbackSnapshots: TestRunSnapshot[] = [];

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseSnapshots(raw: string | null): TestRunSnapshot[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as TestRunSnapshot[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.profileId === 'string' &&
        typeof item.profileLabel === 'string' &&
        typeof item.command === 'string' &&
        typeof item.status === 'string' &&
        typeof item.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function readSnapshots(): TestRunSnapshot[] {
  const storage = getStorage();
  if (!storage) {
    return [...fallbackSnapshots];
  }
  return parseSnapshots(storage.getItem(TEST_RUNS_STORAGE_KEY));
}

function writeSnapshots(snapshots: TestRunSnapshot[]): void {
  const normalized = snapshots.slice(0, MAX_SNAPSHOTS);
  const storage = getStorage();
  if (!storage) {
    fallbackSnapshots = normalized;
    return;
  }
  try {
    storage.setItem(TEST_RUNS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    fallbackSnapshots = normalized;
  }
}

function sortByOrderThenLabel<T extends { order?: number; label: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const orderA = a.order ?? 9999;
    const orderB = b.order ?? 9999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.label.localeCompare(b.label);
  });
}

function windowToDays(window: TimeWindow): number | null {
  if (window === '7d') {
    return 7;
  }
  if (window === '14d') {
    return 14;
  }
  if (window === '30d') {
    return 30;
  }
  return null;
}

function parseSnapshotDate(createdAt: string): Date | null {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(keys: string[]): string[] {
  if (keys.length === 0) {
    return [];
  }
  const sorted = [...new Set(keys)].sort();
  const start = parseSnapshotDate(sorted[0]);
  const end = parseSnapshotDate(sorted[sorted.length - 1]);
  if (!start || !end) {
    return sorted;
  }
  const range: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    range.push(toDateKey(cursor));
  }
  return range;
}

function filterSnapshotsForAnalytics(
  snapshots: TestRunSnapshot[],
  options: TestAnalyticsOptions = {},
): TestRunSnapshot[] {
  const window = options.window ?? 'all';
  const profileId = options.profileId;
  const now = options.now ?? new Date();
  const days = windowToDays(window);
  const cutoff = days === null ? null : new Date(now.getTime() - days * DAY_IN_MS);

  return snapshots.filter((snapshot) => {
    if (profileId && snapshot.profileId !== profileId) {
      return false;
    }
    if (!cutoff) {
      return true;
    }
    const createdAt = parseSnapshotDate(snapshot.createdAt);
    return createdAt ? createdAt >= cutoff : false;
  });
}

function collectDateKeys(snapshots: TestRunSnapshot[]): string[] {
  const keys: string[] = [];
  for (const snapshot of snapshots) {
    const createdAt = parseSnapshotDate(snapshot.createdAt);
    if (!createdAt) {
      continue;
    }
    keys.push(toDateKey(createdAt));
  }
  return keys;
}

export function getTestOverview(): TestOverview {
  ensureBuiltInTestCatalogRegistered();
  return {
    profiles: sortByOrderThenLabel(testProfileRegistry.getAll()),
    suites: sortByOrderThenLabel(testSuiteRegistry.getAll()),
    docs: [...TEST_DOCS],
  };
}

export function listTestRunSnapshots(limit = 20): TestRunSnapshot[] {
  return readSnapshots()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, limit));
}

export function getRunStatusSeries(
  snapshots: TestRunSnapshot[],
  options: TestAnalyticsOptions = {},
): StatusSeriesPoint[] {
  const filtered = filterSnapshotsForAnalytics(snapshots, options);
  const dateKeys = collectDateKeys(filtered);
  if (dateKeys.length === 0) {
    return [];
  }

  const buckets = new Map<string, StatusSeriesPoint>();
  for (const dateKey of buildDateRange(dateKeys)) {
    buckets.set(dateKey, { date: dateKey, passed: 0, failed: 0, skipped: 0 });
  }

  for (const snapshot of filtered) {
    const createdAt = parseSnapshotDate(snapshot.createdAt);
    if (!createdAt) {
      continue;
    }
    const key = toDateKey(createdAt);
    const bucket =
      buckets.get(key) ??
      {
        date: key,
        passed: 0,
        failed: 0,
        skipped: 0,
      };
    if (snapshot.status === 'passed') {
      bucket.passed += 1;
    } else if (snapshot.status === 'failed') {
      bucket.failed += 1;
    } else {
      bucket.skipped += 1;
    }
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getPassRateByProfile(
  snapshots: TestRunSnapshot[],
  options: TestAnalyticsOptions = {},
): ProfilePassRate[] {
  const filtered = filterSnapshotsForAnalytics(snapshots, options);
  const profileMetrics = new Map<string, { profileLabel: string; total: number; passed: number }>();

  for (const snapshot of filtered) {
    const current = profileMetrics.get(snapshot.profileId) ?? {
      profileLabel: snapshot.profileLabel,
      total: 0,
      passed: 0,
    };
    current.total += 1;
    if (snapshot.status === 'passed') {
      current.passed += 1;
    }
    profileMetrics.set(snapshot.profileId, current);
  }

  return [...profileMetrics.entries()]
    .map(([profileId, metric]) => ({
      profileId,
      profileLabel: metric.profileLabel,
      total: metric.total,
      passed: metric.passed,
      rate: metric.total > 0 ? metric.passed / metric.total : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total || a.profileLabel.localeCompare(b.profileLabel));
}

export function getRunVolumeSeries(
  snapshots: TestRunSnapshot[],
  options: TestAnalyticsOptions = {},
): RunVolumeSeriesPoint[] {
  const filtered = filterSnapshotsForAnalytics(snapshots, options);
  const dateKeys = collectDateKeys(filtered);
  if (dateKeys.length === 0) {
    return [];
  }

  const buckets = new Map<string, number>();
  for (const dateKey of buildDateRange(dateKeys)) {
    buckets.set(dateKey, 0);
  }

  for (const snapshot of filtered) {
    const createdAt = parseSnapshotDate(snapshot.createdAt);
    if (!createdAt) {
      continue;
    }
    const key = toDateKey(createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function clearTestRunSnapshots(): void {
  const storage = getStorage();
  fallbackSnapshots = [];
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(TEST_RUNS_STORAGE_KEY);
  } catch {
    // Ignore storage deletion errors to keep panel usable in constrained environments.
  }
}

function resolveProfile(profileId: TestProfileId): TestProfileDefinition {
  ensureBuiltInTestCatalogRegistered();
  const profile = testProfileRegistry.get(profileId);
  if (!profile) {
    throw new Error(`Unknown test profile: ${profileId}`);
  }
  return profile;
}

function buildSnapshotId(): string {
  const entropy = Math.random().toString(36).slice(2, 9);
  return `test-run-${Date.now().toString(36)}-${entropy}`;
}

export function recordTestRunSnapshot(
  profileId: TestProfileId,
  status: TestRunStatus,
): TestRunSnapshot {
  const profile = resolveProfile(profileId);
  const snapshot: TestRunSnapshot = {
    id: buildSnapshotId(),
    profileId,
    profileLabel: profile.label,
    command: profile.command,
    status,
    createdAt: new Date().toISOString(),
  };
  const existing = readSnapshots();
  writeSnapshots([snapshot, ...existing]);
  return snapshot;
}

export { registerTestCatalogPlugin, registerTestProfile, registerTestSuite };
