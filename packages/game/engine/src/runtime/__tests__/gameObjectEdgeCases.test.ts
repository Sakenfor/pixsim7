/**
 * Advanced edge-case tests for GameObject store and query filtering.
 *
 * Checkpoint: verification (gameobject-runtime-refactor-v1)
 * Covers: malformed objects, duplicate refs, disabled capability filtering,
 * legacy+canonical collision, transform normalization, query edge cases.
 */
import { LocationId, NpcId, WorldId } from '@pixsim7/shared.types';
import type { GameObject, GameSessionDTO, Transform } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  getSessionGameObject,
  getSessionGameObjectStore,
  listSessionGameObjects,
  toGameObjectRef,
  upsertSessionGameObjects,
} from '../gameObjectStore';

function createSession(flags: Record<string, unknown> = {}): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    world_id: 1,
    flags,
    stats: {},
    world_time: 0,
    version: 1,
  };
}

function createTransform(locationId?: number): Transform {
  return {
    worldId: WorldId(1),
    locationId: locationId != null ? LocationId(locationId) : undefined,
    position: { x: 0, y: 0 },
    space: 'world_2d',
  };
}

// ---------------------------------------------------------------------------
// Malformed Object Normalization
// ---------------------------------------------------------------------------

describe('edge cases: malformed object normalization', () => {
  it('throws on objects with missing kind (ref cannot be built)', () => {
    expect(() =>
      upsertSessionGameObjects(createSession(), [
        { id: NpcId(1), ref: 'npc:1', name: 'Test', runtimeKind: 'npc', transform: createTransform() } as unknown as GameObject,
      ]),
    ).toThrow('Cannot build game object ref');
  });

  it('throws on objects with empty string id', () => {
    expect(() =>
      upsertSessionGameObjects(createSession(), [
        { kind: 'npc', id: '  ', ref: 'npc:1', name: 'Test', runtimeKind: 'npc', transform: createTransform() } as unknown as GameObject,
      ]),
    ).toThrow('Cannot build game object ref');
  });

  it('throws on objects with NaN id', () => {
    expect(() =>
      upsertSessionGameObjects(createSession(), [
        { kind: 'npc', id: NaN, ref: 'npc:1', name: 'Test', runtimeKind: 'npc', transform: createTransform() } as unknown as GameObject,
      ]),
    ).toThrow('Cannot build game object ref');
  });

  it('uses fallback name when name is missing or empty', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'box_1',
        ref: 'prop:box_1',
        name: '',
        runtimeKind: 'prop',
        transform: createTransform(),
        propData: { propDefId: 'box' },
      },
    ]);
    const obj = getSessionGameObject(session, 'prop:box_1');
    expect(obj).toBeTruthy();
    // Falls back to ref as name
    expect(obj!.name).toBe('prop:box_1');
  });

  it('defaults runtimeKind to kind when not provided', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'sign_1',
        ref: 'prop:sign_1',
        name: 'Sign',
        transform: createTransform(),
        propData: { propDefId: 'sign' },
      } as unknown as GameObject,
    ]);
    const obj = getSessionGameObject(session, 'prop:sign_1');
    expect(obj).toBeTruthy();
    expect(obj!.runtimeKind).toBe('prop');
  });

  it('filters out capabilities with missing or empty id', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'chest',
        ref: 'prop:chest',
        name: 'Chest',
        runtimeKind: 'prop',
        transform: createTransform(),
        capabilities: [
          { id: 'interactable', enabled: true },
          { id: '', enabled: true },
          { id: '  ', enabled: false },
          { enabled: true } as any,
        ],
        propData: { propDefId: 'chest' },
      },
    ]);

    const obj = getSessionGameObject(session, 'prop:chest');
    expect(obj!.capabilities).toHaveLength(1);
    expect(obj!.capabilities![0].id).toBe('interactable');
  });
});

// ---------------------------------------------------------------------------
// Duplicate Refs
// ---------------------------------------------------------------------------

describe('edge cases: duplicate refs', () => {
  it('later object overwrites earlier object with same ref', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Original',
        runtimeKind: 'npc',
        transform: createTransform(1),
        npcData: { role: 'guard' },
      },
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Replacement',
        runtimeKind: 'npc',
        transform: createTransform(2),
        npcData: { role: 'merchant' },
      },
    ]);

    const all = listSessionGameObjects(session);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Replacement');
  });

  it('second upsert batch merges with first batch', () => {
    let session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Alpha',
        runtimeKind: 'npc',
        transform: createTransform(),
        npcData: { role: 'guard' },
      },
    ]);

    session = upsertSessionGameObjects(session, [
      {
        kind: 'npc',
        id: NpcId(2),
        ref: 'npc:2',
        name: 'Beta',
        runtimeKind: 'npc',
        transform: createTransform(),
        npcData: { role: 'merchant' },
      },
    ]);

    expect(listSessionGameObjects(session)).toHaveLength(2);
    expect(getSessionGameObject(session, 'npc:1')?.name).toBe('Alpha');
    expect(getSessionGameObject(session, 'npc:2')?.name).toBe('Beta');
  });
});

// ---------------------------------------------------------------------------
// Transform Normalization
// ---------------------------------------------------------------------------

describe('edge cases: transform normalization', () => {
  it('falls back to session world_id and default position on malformed transform', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(5),
        ref: 'npc:5',
        name: 'Lost NPC',
        runtimeKind: 'npc',
        transform: { position: { x: 'invalid', y: NaN } } as any,
        npcData: {},
      },
    ]);

    const obj = getSessionGameObject(session, 'npc:5');
    expect(obj).toBeTruthy();
    // Falls back to default position
    expect(obj!.transform.position).toEqual({ x: 0, y: 0 });
    expect(obj!.transform.worldId).toBe(WorldId(1));
  });

  it('preserves valid transform position even with negative locationId', () => {
    // normalizeTransform spreads the raw transform; negative locationId is
    // only filtered in createFallbackTransform (the fallback path).
    // When the raw transform has valid worldId + position, it is used as-is.
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'item_a',
        ref: 'prop:item_a',
        name: 'Test',
        runtimeKind: 'prop',
        transform: {
          worldId: WorldId(1),
          locationId: -5 as any,
          position: { x: 10, y: 20 },
        },
        propData: { propDefId: 'test' },
      },
    ]);

    const obj = getSessionGameObject(session, 'prop:item_a');
    // Position is preserved from valid transform
    expect(obj!.transform.position).toEqual({ x: 10, y: 20 });
  });
});

// ---------------------------------------------------------------------------
// Legacy + Canonical Collision
// ---------------------------------------------------------------------------

describe('edge cases: legacy + canonical collision', () => {
  it('canonical objects take precedence over legacy objects with same ref', () => {
    const session = upsertSessionGameObjects(
      createSession({
        npcs: { 'npc:1': { name: 'Legacy Guard', role: 'guard' } },
      }),
      [
        {
          kind: 'npc',
          id: NpcId(1),
          ref: 'npc:1',
          name: 'Canonical Guard',
          runtimeKind: 'npc',
          transform: createTransform(10),
          npcData: { role: 'elite_guard' },
        },
      ],
    );

    const obj = getSessionGameObject(session, 'npc:1');
    expect(obj!.name).toBe('Canonical Guard');
    if (obj!.kind === 'npc') {
      expect(obj!.npcData?.role).toBe('elite_guard');
    }
  });

  it('hydrateLegacy: false on getSessionGameObjectStore excludes legacy objects', () => {
    // Create a session with only legacy data (no canonical upsert)
    const session = createSession({
      npcs: { 'npc:1': { name: 'Legacy NPC' } },
      inventory: { items: [{ id: 'sword', qty: 1 }] },
    });

    // With hydration — legacy objects appear
    const withLegacy = getSessionGameObjectStore(session, { hydrateLegacy: true });
    expect(Object.keys(withLegacy.objects)).toContain('npc:1');
    expect(Object.keys(withLegacy.objects)).toContain('item:sword');

    // Without hydration — only canonical store (empty here)
    const withoutLegacy = getSessionGameObjectStore(session, { hydrateLegacy: false });
    expect(Object.keys(withoutLegacy.objects)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Query Filtering Edge Cases
// ---------------------------------------------------------------------------

describe('edge cases: query filtering', () => {
  function buildFilterSession() {
    return upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Active Guard',
        runtimeKind: 'npc',
        transform: createTransform(5),
        tags: ['patrol', 'armored'],
        capabilities: [
          { id: 'dialogue_target', enabled: true },
          { id: 'interactable', enabled: true },
        ],
        npcData: { role: 'guard' },
      },
      {
        kind: 'prop',
        id: 'locked_door',
        ref: 'prop:locked_door',
        name: 'Locked Door',
        runtimeKind: 'prop',
        transform: createTransform(5),
        tags: ['obstacle'],
        capabilities: [
          { id: 'navigation_blocker', enabled: true },
          { id: 'interactable', enabled: false },
        ],
        propData: { propDefId: 'door' },
      },
      {
        kind: 'item',
        id: 'key',
        ref: 'item:key',
        name: 'Golden Key',
        runtimeKind: 'item',
        transform: createTransform(5),
        tags: ['quest', 'collectible'],
        capabilities: [{ id: 'inventory_item', enabled: true }],
        itemData: { itemDefId: 'key', quantity: 1 },
      },
    ]);
  }

  it('disabled capability does not match query', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, { capability: 'interactable' });
    // Only the guard (enabled), not the door (disabled)
    expect(results.map((o) => o.ref)).toEqual(['npc:1']);
  });

  it('empty capability string matches all objects', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, { capability: '' });
    expect(results).toHaveLength(3);
  });

  it('empty tags array matches all objects', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, { tags: [] });
    expect(results).toHaveLength(3);
  });

  it('tag filtering is case-insensitive', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, { tags: ['PATROL'] });
    expect(results.map((o) => o.ref)).toEqual(['npc:1']);
  });

  it('combining kind + locationId + capability + tags filters correctly', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, {
      kind: 'npc',
      locationId: 5,
      capability: 'dialogue_target',
      tags: ['armored'],
    });
    expect(results).toHaveLength(1);
    expect(results[0].ref).toBe('npc:1');
  });

  it('no matches returns empty array', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, {
      kind: 'trigger',
    });
    expect(results).toEqual([]);
  });

  it('locationId filter excludes objects at other locations', () => {
    const session = buildFilterSession();
    const results = listSessionGameObjects(session, { locationId: 99 });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toGameObjectRef edge cases
// ---------------------------------------------------------------------------

describe('edge cases: toGameObjectRef', () => {
  it('throws on empty kind', () => {
    expect(() => toGameObjectRef('', 'abc')).toThrow();
  });

  it('throws on empty id string', () => {
    expect(() => toGameObjectRef('npc', '')).toThrow();
  });

  it('throws on NaN numeric id', () => {
    expect(() => toGameObjectRef('npc', NaN)).toThrow();
  });

  it('trims whitespace from kind and id', () => {
    expect(toGameObjectRef('  npc  ', '  42  ')).toBe('npc:42');
  });
});
