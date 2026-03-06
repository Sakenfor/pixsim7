import { describe, expect, it } from 'vitest';

import type { GameProjectBundle } from '@lib/api';

import { buildProjectInventory, selectProjectInventorySource } from './projectInventory';

function makeBundle(extensions: Record<string, unknown> = {}): GameProjectBundle {
  return {
    schema_version: 1,
    exported_at: '2026-03-06T00:00:00Z',
    core: {
      world: {
        name: 'Bananza',
        world_time: 0,
        meta: {},
      },
      locations: [
        { source_id: 1, name: 'Town', hotspots: [{ hotspot_id: 'a' }, { hotspot_id: 'b' }] },
        { source_id: 2, name: 'Beach', hotspots: [] },
      ],
      npcs: [
        { source_id: 11, name: 'Maya', schedules: [{ source_id: 101 }], expressions: [{ source_id: 201 }] },
        { source_id: 12, name: 'Kai', schedules: [{ source_id: 102 }, { source_id: 103 }], expressions: [] },
      ],
      scenes: [
        { source_id: 21, title: 'Intro', nodes: [{ source_id: 301 }, { source_id: 302 }], edges: [{ source_id: 401 }] },
      ],
      items: [{ source_id: 31, name: 'Ticket' }],
    },
    extensions,
  } as unknown as GameProjectBundle;
}

function toCountMap(rows: Array<{ key: string; count: number }>): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.key, row.count]));
}

describe('buildProjectInventory', () => {
  it('builds core category counts', () => {
    const summary = buildProjectInventory(makeBundle());
    const counts = toCountMap(summary.core);

    expect(counts.world).toBe(1);
    expect(counts.locations).toBe(2);
    expect(counts.hotspots).toBe(2);
    expect(counts.characters).toBe(2);
    expect(counts.schedules).toBe(3);
    expect(counts.expressions).toBe(1);
    expect(counts.scenes).toBe(1);
    expect(counts.nodes).toBe(2);
    expect(counts.edges).toBe(1);
    expect(counts.items).toBe(1);
  });

  it('summarizes extension payloads with inferred counts', () => {
    const summary = buildProjectInventory(
      makeBundle({
        'inventory.array': [1, 2, 3],
        'inventory.templates': { templates: [{ id: 1 }, { id: 2 }] },
        'inventory.count': { item_count: 5 },
        'inventory.keys': { alpha: true, beta: true, gamma: true },
        'inventory.scalar': 'enabled',
      }),
    );

    const extensionCounts = toCountMap(summary.extensions);
    expect(extensionCounts['inventory.array']).toBe(3);
    expect(extensionCounts['inventory.templates']).toBe(2);
    expect(extensionCounts['inventory.count']).toBe(5);
    expect(extensionCounts['inventory.keys']).toBe(3);
    expect(extensionCounts['inventory.scalar']).toBe(1);

    const templateRow = summary.extensions.find((row) => row.key === 'inventory.templates');
    expect(templateRow?.detail).toContain('"templates"');
  });
});

describe('selectProjectInventorySource', () => {
  it('prefers active world while a project session is loaded', () => {
    expect(
      selectProjectInventorySource({
        worldId: 42,
        currentProjectId: 7,
        selectedProjectId: 99,
      }),
    ).toEqual({ kind: 'active_world', worldId: 42 });
  });

  it('uses selected saved project snapshot when no project session is active', () => {
    expect(
      selectProjectInventorySource({
        worldId: 42,
        currentProjectId: null,
        selectedProjectId: 99,
      }),
    ).toEqual({ kind: 'saved_project', projectId: 99 });
  });

  it('falls back to active world when no snapshot is selected', () => {
    expect(
      selectProjectInventorySource({
        worldId: 42,
        currentProjectId: null,
        selectedProjectId: null,
      }),
    ).toEqual({ kind: 'active_world', worldId: 42 });
  });

  it('returns none when neither world nor project is available', () => {
    expect(
      selectProjectInventorySource({
        worldId: null,
        currentProjectId: null,
        selectedProjectId: null,
      }),
    ).toEqual({ kind: 'none' });
  });
});
