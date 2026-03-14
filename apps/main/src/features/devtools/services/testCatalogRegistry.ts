import { BaseRegistry, type Identifiable } from '@pixsim7/shared.ui.panels';


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

// Frontend suites stay here; backend/scripts suites self-register via
// TEST_SUITE dicts in their Python files (discovered by discover_backend_suites.py).
const BUILTIN_SUITES: TestSuiteDefinition[] = [
  // --- Frontend ---
  {
    id: 'project-bundle-ui',
    label: 'Project Bundle UI',
    path: 'apps/main/src/lib/game/projectBundle/__tests__',
    layer: 'frontend',
    kind: 'integration',
    category: 'frontend/project-bundle',
    subcategory: 'all',
    covers: ['apps/main/src/lib/game/projectBundle'],
    order: 10,
  },
  {
    id: 'project-bundle-lifecycle-ui',
    label: 'Project Bundle Lifecycle UI',
    path: 'apps/main/src/lib/game/projectBundle/__tests__/lifecycleRuntime.test.ts',
    layer: 'frontend',
    kind: 'integration',
    category: 'frontend/project-bundle',
    subcategory: 'lifecycle',
    covers: [
      'apps/main/src/lib/game/projectBundle/lifecycle.ts',
      'apps/main/src/lib/game/projectBundle/service.ts',
    ],
    order: 15,
  },
  {
    id: 'project-bundle-runtime-meta-ui',
    label: 'Project Bundle Runtime Meta UI',
    path: 'apps/main/src/lib/game/projectBundle/__tests__/runtimeMeta.test.ts',
    layer: 'frontend',
    kind: 'unit',
    category: 'frontend/project-bundle',
    subcategory: 'runtime-meta',
    covers: ['apps/main/src/lib/game/projectBundle/runtimeMeta.ts'],
    order: 16,
  },
  {
    id: 'project-bundle-version-migration-ui',
    label: 'Project Bundle Version Migration UI',
    path: 'apps/main/src/lib/game/projectBundle/__tests__/versionMigration.test.ts',
    layer: 'frontend',
    kind: 'integration',
    category: 'frontend/project-bundle',
    subcategory: 'version-migration',
    covers: [
      'apps/main/src/lib/game/projectBundle/index.ts',
      'apps/main/src/lib/game/projectBundle/service.ts',
    ],
    order: 17,
  },
  {
    id: 'project-bundle-contributor-ui',
    label: 'Project Bundle Contributor UI',
    path: 'apps/main/src/lib/game/projectBundle/__tests__/contributorClass.test.ts',
    layer: 'frontend',
    kind: 'unit',
    category: 'frontend/project-bundle',
    subcategory: 'contributors',
    covers: ['apps/main/src/lib/game/projectBundle/registry.ts'],
    order: 18,
  },
  // --- Non-Python scripts entries (cannot self-register) ---
  {
    id: 'block-ops-primitive-projection-eval',
    label: 'Block Ops Primitive Projection Eval',
    path: 'scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py',
    layer: 'scripts',
    kind: 'smoke',
    category: 'scripts/block-ops',
    subcategory: 'primitive-projection-eval',
    covers: [
      'scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py',
      'scripts/tests/block_ops/primitive_projection/eval_corpus.json',
    ],
    order: 54,
  },
  {
    id: 'block-ops-primitive-projection-eval-medium',
    label: 'Block Ops Primitive Projection Eval (Medium)',
    path: 'scripts/tests/block_ops/primitive_projection/eval_corpus_medium.json',
    layer: 'scripts',
    kind: 'smoke',
    category: 'scripts/block-ops',
    subcategory: 'primitive-projection-eval-medium',
    covers: [
      'scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py',
      'scripts/tests/block_ops/primitive_projection/eval_corpus_medium.json',
    ],
    order: 55,
  },
];

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
  BUILTIN_SUITES.forEach((suite) => {
    registerTestSuite(suite);
  });

  builtinsRegistered = true;
}

export function resetTestCatalogForTesting(): void {
  testProfileRegistry.clear();
  testSuiteRegistry.clear();
  builtinsRegistered = false;
}
