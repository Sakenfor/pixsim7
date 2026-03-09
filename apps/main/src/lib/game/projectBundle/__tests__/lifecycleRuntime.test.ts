import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exportWorldProject as exportWorldProjectCore,
  importWorldProject as importWorldProjectCore,
  type GameProjectBundle,
} from '@lib/api';

import {
  ProjectBundleRuntimeLifecycleTracker,
} from '../lifecycle';
import { projectBundleExtensionRegistry, registerProjectBundleExtension } from '../registry';
import {
  __resetProjectBundleRuntimeImportCacheForTests,
  exportWorldProjectWithExtensions,
  importWorldProjectWithExtensions,
} from '../service';

vi.mock('@lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    importWorldProject: vi.fn().mockResolvedValue({
      schema_version: 1,
      world_id: 77,
      world_name: 'Lifecycle Test',
      counts: {
        locations: 0,
        hotspots: 0,
        npcs: 0,
        schedules: 0,
        expressions: 0,
        scenes: 0,
        nodes: 0,
        edges: 0,
        items: 0,
      },
      id_maps: { locations: {}, npcs: {}, scenes: {}, nodes: {}, items: {} },
      warnings: [],
    }),
    exportWorldProject: vi.fn().mockResolvedValue({
      schema_version: 1,
      exported_at: '2026-03-08T00:00:00Z',
      core: {
        world: { name: 'Lifecycle Test' },
        locations: [],
        npcs: [],
        scenes: [],
        items: [],
      },
      modules: [],
      extensions: {},
    }),
  };
});

function makeBundle(
  extensions: Record<string, unknown>,
  modules?: GameProjectBundle['modules'],
): GameProjectBundle {
  return {
    schema_version: 1,
    exported_at: '2026-03-08T00:00:00Z',
    core: {
      world: { name: 'Lifecycle Test' },
      locations: [],
      npcs: [],
      scenes: [],
      items: [],
    },
    extensions,
    ...(modules ? { modules } : {}),
  };
}

describe('project bundle lifecycle runtime', () => {
  beforeEach(() => {
    projectBundleExtensionRegistry.clear();
    __resetProjectBundleRuntimeImportCacheForTests();
    vi.mocked(importWorldProjectCore).mockResolvedValue({
      schema_version: 1,
      world_id: 77,
      world_name: 'Lifecycle Test',
      counts: {
        locations: 0,
        hotspots: 0,
        npcs: 0,
        schedules: 0,
        expressions: 0,
        scenes: 0,
        nodes: 0,
        edges: 0,
        items: 0,
      },
      id_maps: { locations: {}, npcs: {}, scenes: {}, nodes: {}, items: {} },
      warnings: [],
    });
  });

  it('supports valid lifecycle transitions', () => {
    const tracker = new ProjectBundleRuntimeLifecycleTracker(['ext.lifecycle']);
    tracker.transition('ext.lifecycle', 'registered');
    tracker.transition('ext.lifecycle', 'imported');
    tracker.transition('ext.lifecycle', 'active');
    tracker.transition('ext.lifecycle', 'disabled');
    tracker.transition('ext.lifecycle', 'registered');
    tracker.transition('ext.lifecycle', 'removed');
    tracker.transition('ext.lifecycle', 'registered');

    expect(tracker.snapshot()['ext.lifecycle']).toBe('registered');
  });

  it('rejects invalid lifecycle transitions', () => {
    const tracker = new ProjectBundleRuntimeLifecycleTracker(['ext.lifecycle']);
    expect(() => tracker.transition('ext.lifecycle', 'active')).toThrow(
      /invalid_project_bundle_lifecycle_transition/,
    );
  });

  it('treats repeated imports with identical payload as idempotent replay', async () => {
    const importFn = vi.fn().mockResolvedValue(undefined);
    registerProjectBundleExtension({
      key: 'ext.idempotent',
      version: 1,
      import: importFn,
    });

    const bundle = makeBundle({ 'ext.idempotent': { version: 1, enabled: true } });
    const first = await importWorldProjectWithExtensions(bundle);
    const second = await importWorldProjectWithExtensions(bundle);

    expect(first.extensionReport.applied).toContain('ext.idempotent');
    expect(second.extensionReport.skipped).toContain('ext.idempotent');
    expect(
      second.extensionReport.warnings.some((entry) =>
        entry.includes('idempotent replay'),
      ),
    ).toBe(true);
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('supports disable then re-enable import behavior', async () => {
    const importFn = vi.fn().mockResolvedValue(undefined);
    registerProjectBundleExtension({
      key: 'ext.toggle',
      import: importFn,
    });

    const enabledBundle = makeBundle(
      { 'ext.toggle': { version: 1 } },
      [{ id: 'ext.toggle', enabled: true }],
    );
    const disabledBundle = makeBundle(
      { 'ext.toggle': { version: 1 } },
      [{ id: 'ext.toggle', enabled: false }],
    );

    const first = await importWorldProjectWithExtensions(enabledBundle);
    const disabled = await importWorldProjectWithExtensions(disabledBundle);
    const reenabled = await importWorldProjectWithExtensions(enabledBundle);

    expect(first.extensionReport.applied).toContain('ext.toggle');
    expect(disabled.extensionReport.skipped).toContain('ext.toggle');
    expect(
      disabled.extensionReport.warnings.some((entry) =>
        entry.includes('module is disabled'),
      ),
    ).toBe(true);
    expect(reenabled.extensionReport.applied).toContain('ext.toggle');
    expect(importFn).toHaveBeenCalledTimes(2);
  });

  it('keeps replay bundle POJO shape stable across export/import/reload decisions', async () => {
    const importFn = vi.fn().mockResolvedValue(undefined);
    registerProjectBundleExtension({
      key: 'ext.replay',
      version: 2,
      export: () => ({ version: 2, data: 'ok' }),
      import: importFn,
    });

    vi.mocked(exportWorldProjectCore).mockResolvedValue(
      makeBundle({}, []),
    );

    const exported = await exportWorldProjectWithExtensions(77);
    const savedRoundTrip = JSON.parse(JSON.stringify(exported.bundle)) as GameProjectBundle;

    const loaded = await importWorldProjectWithExtensions(savedRoundTrip);
    const disabled = await importWorldProjectWithExtensions({
      ...savedRoundTrip,
      modules: [{ id: 'ext.replay', enabled: false }],
    });
    const reloaded = await importWorldProjectWithExtensions(savedRoundTrip);

    expect(loaded.extensionReport.applied).toContain('ext.replay');
    expect(disabled.extensionReport.skipped).toContain('ext.replay');
    expect(reloaded.extensionReport.applied).toContain('ext.replay');

    expect(savedRoundTrip).toEqual(exported.bundle);
    expect(exported.bundle).toHaveProperty('core');
    expect(exported.bundle).toHaveProperty('extensions');
    expect(Array.isArray(exported.bundle.modules)).toBe(true);
    expect(importFn).toHaveBeenCalledTimes(2);
  });
});
