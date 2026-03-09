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
