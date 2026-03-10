import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearTestRunSnapshots,
  getPassRateByProfile,
  getRunStatusSeries,
  getRunVolumeSeries,
  getTestOverview,
  listTestRunSnapshots,
  recordTestRunSnapshot,
  type TestRunSnapshot,
} from './testOverviewService';

const NOW = new Date('2026-03-10T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function makeSnapshot(
  overrides: Partial<TestRunSnapshot> &
    Pick<TestRunSnapshot, 'profileId' | 'status' | 'createdAt'>,
): TestRunSnapshot {
  return {
    id: `snapshot-${Math.random().toString(36).slice(2, 9)}`,
    profileLabel: overrides.profileId,
    command: `pnpm test:${overrides.profileId}`,
    ...overrides,
  };
}

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

  describe('analytics aggregators', () => {
    it('applies time filtering for status and volume series', () => {
      const snapshots: TestRunSnapshot[] = [
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: daysAgo(1) }),
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'failed', createdAt: daysAgo(8) }),
        makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'skipped', createdAt: daysAgo(20) }),
      ];

      const statusSeries = getRunStatusSeries(snapshots, { window: '7d', now: NOW });
      const volumeSeries = getRunVolumeSeries(snapshots, { window: '7d', now: NOW });

      expect(statusSeries).toEqual([
        { date: '2026-03-09', passed: 1, failed: 0, skipped: 0 },
      ]);
      expect(volumeSeries).toEqual([
        { date: '2026-03-09', count: 1 },
      ]);
    });

    it('applies profile filtering across all analytics aggregators', () => {
      const snapshots: TestRunSnapshot[] = [
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: '2026-03-09T10:00:00Z' }),
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'failed', createdAt: '2026-03-09T11:00:00Z' }),
        makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'passed', createdAt: '2026-03-09T12:00:00Z' }),
      ];

      const statusSeries = getRunStatusSeries(snapshots, { window: 'all', profileId: 'fast', now: NOW });
      const passRates = getPassRateByProfile(snapshots, { window: 'all', profileId: 'fast', now: NOW });
      const volumeSeries = getRunVolumeSeries(snapshots, { window: 'all', profileId: 'fast', now: NOW });

      expect(statusSeries).toEqual([
        { date: '2026-03-09', passed: 1, failed: 1, skipped: 0 },
      ]);
      expect(passRates).toEqual([
        {
          profileId: 'fast',
          profileLabel: 'Fast',
          total: 2,
          passed: 1,
          rate: 0.5,
        },
      ]);
      expect(volumeSeries).toEqual([
        { date: '2026-03-09', count: 2 },
      ]);
    });

    it('computes pass-rate by profile', () => {
      const snapshots: TestRunSnapshot[] = [
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: daysAgo(1) }),
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'passed', createdAt: daysAgo(2) }),
        makeSnapshot({ profileId: 'fast', profileLabel: 'Fast', status: 'failed', createdAt: daysAgo(3) }),
        makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'failed', createdAt: daysAgo(1) }),
        makeSnapshot({ profileId: 'full', profileLabel: 'Full', status: 'failed', createdAt: daysAgo(2) }),
      ];

      const rates = getPassRateByProfile(snapshots, { window: 'all', now: NOW });

      expect(rates).toEqual([
        {
          profileId: 'fast',
          profileLabel: 'Fast',
          total: 3,
          passed: 2,
          rate: 2 / 3,
        },
        {
          profileId: 'full',
          profileLabel: 'Full',
          total: 2,
          passed: 0,
          rate: 0,
        },
      ]);
    });

    it('handles empty analytics input', () => {
      expect(getRunStatusSeries([], { window: '14d', now: NOW })).toEqual([]);
      expect(getPassRateByProfile([], { window: '14d', now: NOW })).toEqual([]);
      expect(getRunVolumeSeries([], { window: '14d', now: NOW })).toEqual([]);
    });
  });
});
