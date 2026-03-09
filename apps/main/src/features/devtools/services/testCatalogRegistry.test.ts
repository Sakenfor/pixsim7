import { beforeEach, describe, expect, it } from 'vitest';

import {
  ensureBuiltInTestCatalogRegistered,
  registerTestCatalogPlugin,
  registerTestProfile,
  registerTestSuite,
  resetTestCatalogForTesting,
  testProfileRegistry,
  testSuiteRegistry,
} from './testCatalogRegistry';

describe('testCatalogRegistry', () => {
  beforeEach(() => {
    resetTestCatalogForTesting();
  });

  it('registers built-ins once', () => {
    ensureBuiltInTestCatalogRegistered();
    const initialProfiles = testProfileRegistry.getAll().length;
    const initialSuites = testSuiteRegistry.getAll().length;

    ensureBuiltInTestCatalogRegistered();

    expect(testProfileRegistry.getAll()).toHaveLength(initialProfiles);
    expect(testSuiteRegistry.getAll()).toHaveLength(initialSuites);
  });

  it('supports custom profile/suite registration with unregister handles', () => {
    ensureBuiltInTestCatalogRegistered();

    const unregisterProfile = registerTestProfile({
      id: 'custom-smoke',
      label: 'Custom Smoke',
      command: 'pnpm test:fast',
      description: 'Custom profile for smoke checks.',
      targets: ['Backend'],
      tags: ['custom'],
      runRequest: { profile: 'fast', backend_only: true },
    });
    const unregisterSuite = registerTestSuite({
      id: 'custom-suite',
      label: 'Custom Suite',
      path: 'tests/custom',
      layer: 'scripts',
    });

    expect(testProfileRegistry.has('custom-smoke')).toBe(true);
    expect(testSuiteRegistry.has('custom-suite')).toBe(true);

    unregisterProfile();
    unregisterSuite();

    expect(testProfileRegistry.has('custom-smoke')).toBe(false);
    expect(testSuiteRegistry.has('custom-suite')).toBe(false);
  });

  it('supports plugin-style registration for profiles and suites', () => {
    ensureBuiltInTestCatalogRegistered();

    const unregisterPlugin = registerTestCatalogPlugin({
      id: 'plugin-tests',
      profiles: [
        {
          id: 'plugin-fast',
          label: 'Plugin Fast',
          command: 'pnpm test:fast',
          description: 'Plugin profile example.',
          targets: ['Backend + Frontend'],
          tags: ['plugin'],
          runRequest: { profile: 'fast' },
        },
      ],
      suites: [
        {
          id: 'plugin-suite',
          label: 'Plugin Suite',
          path: 'tests/plugin-suite',
          layer: 'scripts',
        },
      ],
    });

    expect(testProfileRegistry.has('plugin-fast')).toBe(true);
    expect(testSuiteRegistry.has('plugin-suite')).toBe(true);

    unregisterPlugin();

    expect(testProfileRegistry.has('plugin-fast')).toBe(false);
    expect(testSuiteRegistry.has('plugin-suite')).toBe(false);
  });

  it('does not unregister existing entries when duplicate registration is ignored', () => {
    ensureBuiltInTestCatalogRegistered();

    const existing = testProfileRegistry.get('fast');
    expect(existing).toBeDefined();

    const unregisterDuplicate = registerTestProfile({
      id: 'fast',
      label: 'Duplicate Fast',
      command: 'pnpm test:fast',
      description: 'Duplicate profile should be ignored.',
      targets: ['Backend + Frontend'],
      tags: ['duplicate'],
      runRequest: { profile: 'fast' },
    });

    // Duplicate register should not replace the existing built-in entry.
    expect(testProfileRegistry.get('fast')).toEqual(existing);

    unregisterDuplicate();

    // Unregister handle from ignored duplicate should be a no-op.
    expect(testProfileRegistry.get('fast')).toEqual(existing);
  });
});
