import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { GameProjectBundle } from '@lib/api';

import {
  projectBundleExtensionRegistry,
  registerProjectBundleExtension,
} from '../registry';
import { importWorldProjectWithExtensions } from '../service';

// Mock the core import so we don't hit a real backend
vi.mock('@lib/api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    importWorldProject: vi.fn().mockResolvedValue({
      schema_version: 1,
      world_id: 1,
      world_name: 'Test',
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
  };
});

function makeBundle(extensions: Record<string, unknown> = {}): GameProjectBundle {
  return {
    schema_version: 1,
    exported_at: '2026-01-01T00:00:00Z',
    core: {
      world: { name: 'Test' },
      locations: [],
      npcs: [],
      scenes: [],
      items: [],
    },
    extensions,
  };
}

describe('extension version migration', () => {
  beforeEach(() => {
    projectBundleExtensionRegistry.clear();
  });

  it('calls migrate when payload version does not match handler version', async () => {
    const migrateFn = vi.fn().mockReturnValue({ version: 2, data: 'migrated' });
    const importFn = vi.fn();

    registerProjectBundleExtension({
      key: 'test.migrate.a',
      version: 2,
      migrate: migrateFn,
      import: importFn,
    });

    const bundle = makeBundle({ 'test.migrate.a': { version: 1, data: 'old' } });
    const { extensionReport } = await importWorldProjectWithExtensions(bundle);

    expect(migrateFn).toHaveBeenCalledWith({ version: 1, data: 'old' }, 1, 2);
    expect(importFn).toHaveBeenCalledWith(
      { version: 2, data: 'migrated' },
      expect.any(Object),
    );
    expect(extensionReport.migrated).toContain('test.migrate.a');
    expect(extensionReport.applied).toContain('test.migrate.a');
  });

  it('warns when no migrate function and version mismatch', async () => {
    const importFn = vi.fn();

    registerProjectBundleExtension({
      key: 'test.nomigrate.b',
      version: 3,
      import: importFn,
    });

    const bundle = makeBundle({ 'test.nomigrate.b': { version: 1, data: 'old' } });
    const { extensionReport } = await importWorldProjectWithExtensions(bundle);

    // Should still attempt import
    expect(importFn).toHaveBeenCalled();
    expect(extensionReport.warnings.some((w) => w.includes('version mismatch'))).toBe(true);
    expect(extensionReport.migrated).not.toContain('test.nomigrate.b');
  });

  it('reports failed when migrate returns null', async () => {
    const migrateFn = vi.fn().mockReturnValue(null);
    const importFn = vi.fn();

    registerProjectBundleExtension({
      key: 'test.failmigrate.c',
      version: 2,
      migrate: migrateFn,
      import: importFn,
    });

    const bundle = makeBundle({ 'test.failmigrate.c': { version: 1 } });
    const { extensionReport } = await importWorldProjectWithExtensions(bundle);

    expect(extensionReport.failed).toContain('test.failmigrate.c');
    expect(importFn).not.toHaveBeenCalled();
  });

  it('skips migration when versions match', async () => {
    const migrateFn = vi.fn();
    const importFn = vi.fn();

    registerProjectBundleExtension({
      key: 'test.match.d',
      version: 1,
      migrate: migrateFn,
      import: importFn,
    });

    const bundle = makeBundle({ 'test.match.d': { version: 1, data: 'current' } });
    const { extensionReport } = await importWorldProjectWithExtensions(bundle);

    expect(migrateFn).not.toHaveBeenCalled();
    expect(importFn).toHaveBeenCalled();
    expect(extensionReport.migrated).not.toContain('test.match.d');
    expect(extensionReport.applied).toContain('test.match.d');
  });

  it('handles backward compatibility when payload has no version field', async () => {
    const migrateFn = vi.fn();
    const importFn = vi.fn();

    registerProjectBundleExtension({
      key: 'test.noversion.e',
      version: 2,
      migrate: migrateFn,
      import: importFn,
    });

    const bundle = makeBundle({ 'test.noversion.e': { data: 'legacy' } });
    const { extensionReport } = await importWorldProjectWithExtensions(bundle);

    // No version field means payloadVersion is undefined — migration not triggered
    expect(migrateFn).not.toHaveBeenCalled();
    expect(importFn).toHaveBeenCalled();
    expect(extensionReport.applied).toContain('test.noversion.e');
  });
});
