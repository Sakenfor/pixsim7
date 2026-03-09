import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearTestRunSnapshots,
  getTestOverview,
  listTestRunSnapshots,
  recordTestRunSnapshot,
} from './testOverviewService';

describe('testOverviewService', () => {
  beforeEach(() => {
    clearTestRunSnapshots();
  });

  it('exposes canonical test profiles', () => {
    const overview = getTestOverview();
    const profileIds = overview.profiles.map((profile) => profile.id);
    const suiteIds = overview.suites.map((suite) => suite.id);

    expect(profileIds).toEqual([
      'changed',
      'fast',
      'project-bundle',
      'full',
      'backend',
      'frontend',
    ]);
    expect(suiteIds).toEqual(
      expect.arrayContaining([
        'project-bundle-ui',
        'project-bundle-lifecycle-ui',
        'project-bundle-runtime-meta-ui',
        'project-bundle-version-migration-ui',
        'project-bundle-contributor-ui',
        'backend-tests',
        'codegen-admin-api',
        'assets-upload-api',
        'ownership-policies-service',
        'ownership-user-owned-service',
        'bananza-runtime-preferences',
        'bananza-project-sync',
      ]),
    );
  });

  it('exposes suite metadata for category/subcategory and covers', () => {
    const overview = getTestOverview();
    const codegenSuite = overview.suites.find((suite) => suite.id === 'codegen-admin-api');
    const lifecycleSuite = overview.suites.find((suite) => suite.id === 'project-bundle-lifecycle-ui');

    expect(codegenSuite?.category).toBe('backend/api');
    expect(codegenSuite?.subcategory).toBe('codegen');
    expect(codegenSuite?.kind).toBe('contract');
    expect(codegenSuite?.covers).toEqual(
      expect.arrayContaining([
        'pixsim7/backend/main/api/v1/codegen.py',
      ]),
    );

    expect(lifecycleSuite?.category).toBe('frontend/project-bundle');
    expect(lifecycleSuite?.subcategory).toBe('lifecycle');
    expect(lifecycleSuite?.kind).toBe('integration');
    expect(lifecycleSuite?.covers).toEqual(
      expect.arrayContaining([
        'apps/main/src/lib/game/projectBundle/lifecycle.ts',
      ]),
    );
  });

  it('records and lists snapshots newest-first', () => {
    const first = recordTestRunSnapshot('fast', 'passed');
    const second = recordTestRunSnapshot('project-bundle', 'failed');

    const snapshots = listTestRunSnapshots(10);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].id).toBe(second.id);
    expect(snapshots[0].status).toBe('failed');
    expect(snapshots[1].id).toBe(first.id);
    expect(snapshots[1].status).toBe('passed');
  });
});
