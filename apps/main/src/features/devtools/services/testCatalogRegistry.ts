import { BaseRegistry, type Identifiable } from '@pixsim7/shared.ui.panels';

import { pixsimClient } from '@lib/api';


export type CanonicalTestProfileId = 'changed' | 'fast' | 'project-bundle' | 'full';
export type BuiltInTestProfileId = CanonicalTestProfileId | 'backend' | 'frontend';
export type TestProfileId = BuiltInTestProfileId | (string & {});

export interface TestRunRequestDescriptor {
  profile: CanonicalTestProfileId;
  backend_only?: boolean;
  frontend_only?: boolean;
  list_only?: boolean;
}

export interface TestProfileDefinition extends Identifiable {
  id: TestProfileId;
  label: string;
  command: string;
  description: string;
  targets: string[];
  tags: string[];
  order?: number;
  runRequest: TestRunRequestDescriptor;
}

export type TestSuiteKind = 'unit' | 'contract' | 'integration' | 'e2e' | 'smoke';

export interface TestSuiteDefinition extends Identifiable {
  id: string;
  label: string;
  path: string;
  layer: 'backend' | 'frontend' | 'scripts';
  kind?: TestSuiteKind;
  category?: string;
  subcategory?: string;
  covers?: string[];
  order?: number;
}

export interface RegisterOptions {
  force?: boolean;
}

export interface TestCatalogPlugin extends Identifiable {
  profiles?: TestProfileDefinition[];
  suites?: TestSuiteDefinition[];
}

class TestProfileRegistry extends BaseRegistry<TestProfileDefinition> {}
class TestSuiteRegistry extends BaseRegistry<TestSuiteDefinition> {}

export const testProfileRegistry = new TestProfileRegistry();
export const testSuiteRegistry = new TestSuiteRegistry();

const BUILTIN_PROFILES: TestProfileDefinition[] = [
  {
    id: 'changed',
    label: 'Changed',
    command: 'pnpm test',
    description: 'Resolve backend/frontend targets from changed files with fast-profile fallback.',
    targets: ['Backend + Frontend'],
    tags: ['default', 'mapped', 'incremental'],
    order: 10,
    runRequest: { profile: 'changed' },
  },
  {
    id: 'fast',
    label: 'Fast',
    command: 'pnpm test:fast',
    description: 'Focused suite for lifecycle/runtime/ownership and project-bundle frontend paths.',
    targets: ['Backend + Frontend'],
    tags: ['local', 'smoke'],
    order: 20,
    runRequest: { profile: 'fast' },
  },
  {
    id: 'project-bundle',
    label: 'Project Bundle',
    command: 'pnpm test:project-bundle',
    description: 'Lifecycle/project-bundle profile, including Bananza sync/registration coverage.',
    targets: ['Backend + Frontend'],
    tags: ['lifecycle', 'project-bundle'],
    order: 30,
    runRequest: { profile: 'project-bundle' },
  },
  {
    id: 'full',
    label: 'Full',
    command: 'pnpm test:full',
    description: 'Full backend + frontend test targets configured by the unified test runner.',
    targets: ['Backend + Frontend'],
    tags: ['broad', 'pre-merge'],
    order: 40,
    runRequest: { profile: 'full' },
  },
  {
    id: 'backend',
    label: 'Backend Only',
    command: 'pnpm test:backend',
    description: 'Changed-profile backend-only command.',
    targets: ['Backend'],
    tags: ['backend'],
    order: 50,
    runRequest: { profile: 'changed', backend_only: true },
  },
  {
    id: 'frontend',
    label: 'Frontend Only',
    command: 'pnpm test:frontend',
    description: 'Changed-profile frontend-only command.',
    targets: ['Frontend'],
    tags: ['frontend'],
    order: 60,
    runRequest: { profile: 'changed', frontend_only: true },
  },
];

// Suites are now auto-discovered by the backend (GET /dev/testing/catalog).
// syncSuitesFromBackend() populates the registry from the API at startup.
// Previously hardcoded BUILTIN_SUITES have been removed.

let builtinsRegistered = false;

export function registerTestProfile(
  profile: TestProfileDefinition,
  options: RegisterOptions = {},
): () => void {
  let didRegister = false;
  if (options.force) {
    testProfileRegistry.forceRegister(profile);
    didRegister = true;
  } else {
    didRegister = testProfileRegistry.register(profile);
  }
  return () => {
    if (didRegister) {
      testProfileRegistry.unregister(profile.id);
    }
  };
}

export function registerTestSuite(
  suite: TestSuiteDefinition,
  options: RegisterOptions = {},
): () => void {
  let didRegister = false;
  if (options.force) {
    testSuiteRegistry.forceRegister(suite);
    didRegister = true;
  } else {
    didRegister = testSuiteRegistry.register(suite);
  }
  return () => {
    if (didRegister) {
      testSuiteRegistry.unregister(suite.id);
    }
  };
}

export function registerTestCatalogPlugin(
  plugin: TestCatalogPlugin,
  options: RegisterOptions = {},
): () => void {
  const unregisterFns: Array<() => void> = [];
  for (const profile of plugin.profiles ?? []) {
    unregisterFns.push(registerTestProfile(profile, options));
  }
  for (const suite of plugin.suites ?? []) {
    unregisterFns.push(registerTestSuite(suite, options));
  }

  return () => {
    unregisterFns
      .slice()
      .reverse()
      .forEach((unregister) => unregister());
  };
}

export function ensureBuiltInTestCatalogRegistered(): void {
  if (builtinsRegistered) {
    return;
  }

  BUILTIN_PROFILES.forEach((profile) => {
    registerTestProfile(profile);
  });

  // Suites loaded async from backend — fire and forget on first call.
  void syncSuitesFromBackend();

  builtinsRegistered = true;
}

interface CatalogApiResponse {
  suite_count: number;
  suites: Array<{
    id: string;
    label: string;
    path: string;
    layer: 'backend' | 'frontend' | 'scripts';
    kind: string | null;
    category: string | null;
    subcategory: string | null;
    covers: string[];
    order: number | null;
  }>;
}

let _suitesSynced = false;
const _syncListeners: Array<() => void> = [];

/** Fetch suites from the backend catalog and populate the registry. */
export async function syncSuitesFromBackend(): Promise<void> {
  if (_suitesSynced) return;
  try {
    const response = await pixsimClient.get<CatalogApiResponse>('/dev/testing/catalog');
    for (const s of response.suites) {
      registerTestSuite({
        id: s.id,
        label: s.label,
        path: s.path,
        layer: s.layer,
        kind: (s.kind as TestSuiteKind) ?? undefined,
        category: s.category ?? undefined,
        subcategory: s.subcategory ?? undefined,
        covers: s.covers,
        order: s.order ?? undefined,
      }, { force: true });
    }
    _suitesSynced = true;
    _syncListeners.forEach((fn) => fn());
    _syncListeners.length = 0;
  } catch {
    // Backend unavailable — registry stays empty until next attempt.
    _suitesSynced = false;
  }
}

/** Subscribe to suite sync completion. Returns unsubscribe function. */
export function onSuitesSynced(fn: () => void): () => void {
  if (_suitesSynced) {
    fn();
    return () => {};
  }
  _syncListeners.push(fn);
  return () => {
    const idx = _syncListeners.indexOf(fn);
    if (idx >= 0) _syncListeners.splice(idx, 1);
  };
}

export function resetTestCatalogForTesting(): void {
  testProfileRegistry.clear();
  testSuiteRegistry.clear();
  builtinsRegistered = false;
  _suitesSynced = false;
  _syncListeners.length = 0;
}
