/**
 * Verification tests for GameObject contract + legacy compatibility.
 *
 * Checkpoint: verification (gameobject-runtime-refactor-v1)
 * Steps covered: contract_tests, legacy_compat
 */
import { LocationId, NpcId, WorldId } from '@pixsim7/shared.types';
import type {
  GameObject,
  GameObjectBinding,
  GameObjectCapability,
  GameObjectComponent,
  GameSessionDTO,
  Transform,
} from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  getSessionGameObject,
  getSessionGameObjectStore,
  listSessionGameObjects,
  toGameObjectRef,
  upsertSessionGameObjects,
} from '../gameObjectStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Contract Tests — validate canonical shapes survive round-trip
// ---------------------------------------------------------------------------

describe('contract: GameObject schema round-trip', () => {
  it('preserves capabilities through upsert and retrieval', () => {
    const capabilities: GameObjectCapability[] = [
      { id: 'interactable', enabled: true },
      { id: 'inventory_container', enabled: true, config: { maxSlots: 12 } },
    ];

    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'chest_1',
        ref: 'prop:chest_1',
        name: 'Treasure Chest',
        runtimeKind: 'prop',
        transform: createTransform(5),
        capabilities,
        propData: { propDefId: 'chest', interactionState: 'closed' },
      },
    ]);

    const obj = getSessionGameObject(session, 'prop:chest_1');
    expect(obj).toBeTruthy();
    expect(obj!.capabilities).toHaveLength(2);
    expect(obj!.capabilities![0].id).toBe('interactable');
    expect(obj!.capabilities![1].config).toEqual({ maxSlots: 12 });
  });

  it('preserves components through upsert and retrieval', () => {
    const components: GameObjectComponent[] = [
      { type: 'loot_table', enabled: true, data: { tier: 'rare' } },
      { type: 'physics', enabled: false, data: { mass: 10 } },
    ];

    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'barrel_1',
        ref: 'prop:barrel_1',
        name: 'Barrel',
        runtimeKind: 'prop',
        transform: createTransform(),
        components,
        propData: { propDefId: 'barrel' },
      },
    ]);

    const obj = getSessionGameObject(session, 'prop:barrel_1');
    expect(obj).toBeTruthy();
    expect(obj!.components).toHaveLength(2);
    expect(obj!.components![0].type).toBe('loot_table');
    expect(obj!.components![1].enabled).toBe(false);
  });

  it('preserves binding metadata through upsert and retrieval', () => {
    const binding: GameObjectBinding = {
      templateKind: 'propTemplate',
      templateId: 'door.wooden',
      runtimeKind: 'prop',
      linkId: 'link-abc',
      mappingId: 'map-1',
    };

    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'door_1',
        ref: 'prop:door_1',
        name: 'Wooden Door',
        runtimeKind: 'prop',
        transform: createTransform(3),
        binding,
        propData: { propDefId: 'door' },
      },
    ]);

    const obj = getSessionGameObject(session, 'prop:door_1');
    expect(obj).toBeTruthy();
    expect(obj!.binding).toEqual(binding);
  });

  it('preserves tags through upsert and retrieval', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(10),
        ref: 'npc:10',
        name: 'Guard',
        runtimeKind: 'npc',
        transform: createTransform(2),
        tags: ['hostile', 'patrol', 'armored'],
        npcData: { role: 'guard' },
      },
    ]);

    const obj = getSessionGameObject(session, 'npc:10');
    expect(obj!.tags).toEqual(['hostile', 'patrol', 'armored']);
  });

  it('toGameObjectRef produces canonical ref format', () => {
    expect(toGameObjectRef('npc', 42)).toBe('npc:42');
    expect(toGameObjectRef('item', 'flower')).toBe('item:flower');
    expect(toGameObjectRef('prop', 'door_a')).toBe('prop:door_a');
  });

  it('store schema version is set on new stores', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'prop',
        id: 'box',
        ref: 'prop:box',
        name: 'Box',
        runtimeKind: 'prop',
        transform: createTransform(),
        propData: { propDefId: 'box' },
      },
    ]);

    const store = getSessionGameObjectStore(session);
    expect(store.schemaVersion).toBeDefined();
    expect(typeof store.schemaVersion).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Legacy Compatibility — old session formats still work
// ---------------------------------------------------------------------------

describe('legacy compat: sessions without gameObjects store', () => {
  it('empty session returns empty object list', () => {
    const session = createSession();
    const objects = listSessionGameObjects(session);
    expect(objects).toEqual([]);
  });

  it('legacy npcs hydrate without gameObjects store', () => {
    const session = createSession({
      npcs: {
        'npc:5': { name: 'Bard', role: 'entertainer', tags: ['friendly'] },
      },
    });

    const objects = listSessionGameObjects(session);
    expect(objects).toHaveLength(1);
    expect(objects[0].kind).toBe('npc');
    expect(objects[0].name).toBe('Bard');
    expect(objects[0].ref).toBe('npc:5');
  });

  it('legacy inventory hydrates as item objects', () => {
    const session = createSession({
      inventory: {
        items: [
          { id: 'key', qty: 1 },
          { id: 'coin', qty: 50 },
        ],
      },
    });

    const objects = listSessionGameObjects(session);
    expect(objects).toHaveLength(2);

    const key = getSessionGameObject(session, 'item:key');
    expect(key).toBeTruthy();
    expect(key!.kind).toBe('item');

    const coin = getSessionGameObject(session, 'item:coin');
    expect(coin!.kind).toBe('item');
    if (coin!.kind === 'item') {
      expect(coin!.itemData.quantity).toBe(50);
    }
  });

  it('legacy npcs + inventory coexist with canonical objects', () => {
    const session = upsertSessionGameObjects(
      createSession({
        npcs: {
          'npc:1': { name: 'Merchant', role: 'shop' },
        },
        inventory: {
          items: [{ id: 'bread', qty: 3 }],
        },
      }),
      [
        {
          kind: 'prop',
          id: 'sign_1',
          ref: 'prop:sign_1',
          name: 'Welcome Sign',
          runtimeKind: 'prop',
          transform: createTransform(),
          propData: { propDefId: 'sign' },
        },
      ],
    );

    const all = listSessionGameObjects(session);
    const refs = all.map((o) => o.ref).sort();
    expect(refs).toContain('npc:1');
    expect(refs).toContain('item:bread');
    expect(refs).toContain('prop:sign_1');
  });

  it('item upsert mirrors to legacy inventory for backward compat', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'item',
        id: 'gem',
        ref: 'item:gem',
        name: 'Ruby Gem',
        runtimeKind: 'item',
        transform: createTransform(),
        itemData: { itemDefId: 'gem', quantity: 5 },
      },
    ]);

    const inventory = (session.flags as { inventory?: { items?: Array<{ id: string; qty: number }> } }).inventory;
    expect(inventory?.items).toBeDefined();
    expect(inventory!.items!.find((i) => i.id === 'gem')?.qty).toBe(5);
  });

  it('canonical store lookup works with both string ref and object lookup', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(99),
        ref: 'npc:99',
        name: 'Innkeeper',
        runtimeKind: 'npc',
        transform: createTransform(),
        npcData: { role: 'innkeeper' },
      },
    ]);

    const byRef = getSessionGameObject(session, 'npc:99');
    const byLookup = getSessionGameObject(session, { kind: 'npc', id: 99 });
    expect(byRef).toBeTruthy();
    expect(byLookup).toBeTruthy();
    expect(byRef!.name).toBe(byLookup!.name);
  });
});

// ---------------------------------------------------------------------------
// Custom Kinds — user-defined object kinds with kindData
// ---------------------------------------------------------------------------

describe('custom kinds: objects with user-defined kind and kindData', () => {
  it('stores and retrieves a custom kind object with kindData', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'vehicle',
        id: 'shuttle_1',
        ref: 'vehicle:shuttle_1',
        name: 'Cargo Shuttle',
        runtimeKind: 'vehicle',
        transform: createTransform(5),
        kindData: { speed: 120, fuelCapacity: 500, currentFuel: 350 },
        capabilities: [{ id: 'interactable', enabled: true }],
        tags: ['transport', 'dockable'],
      },
    ]);

    const obj = getSessionGameObject(session, 'vehicle:shuttle_1');
    expect(obj).toBeTruthy();
    expect(obj!.kind).toBe('vehicle');
    expect(obj!.name).toBe('Cargo Shuttle');
    expect(obj!.kindData).toEqual({ speed: 120, fuelCapacity: 500, currentFuel: 350 });
    expect(obj!.tags).toEqual(['transport', 'dockable']);
    expect(obj!.capabilities).toHaveLength(1);
  });

  it('custom kinds are queryable by kind filter', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'vehicle',
        id: 'bike_1',
        ref: 'vehicle:bike_1',
        name: 'Motorbike',
        runtimeKind: 'vehicle',
        transform: createTransform(2),
        kindData: { speed: 80 },
      },
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Guard',
        runtimeKind: 'npc',
        transform: createTransform(2),
        npcData: { role: 'guard' },
      },
      {
        kind: 'structure',
        id: 'tower_1',
        ref: 'structure:tower_1',
        name: 'Watchtower',
        runtimeKind: 'structure',
        transform: createTransform(2),
        kindData: { height: 15 },
      },
    ]);

    const vehicles = listSessionGameObjects(session, { kind: 'vehicle' });
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].name).toBe('Motorbike');

    const structures = listSessionGameObjects(session, { kind: 'structure' });
    expect(structures).toHaveLength(1);
    expect(structures[0].kindData).toEqual({ height: 15 });
  });

  it('custom kinds work with capability and tag filtering', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'furniture',
        id: 'chair_1',
        ref: 'furniture:chair_1',
        name: 'Throne',
        runtimeKind: 'furniture',
        transform: createTransform(),
        capabilities: [{ id: 'interactable', enabled: true }],
        tags: ['royal', 'seating'],
        kindData: { comfort: 10 },
      },
      {
        kind: 'furniture',
        id: 'table_1',
        ref: 'furniture:table_1',
        name: 'Dining Table',
        runtimeKind: 'furniture',
        transform: createTransform(),
        tags: ['seating'],
        kindData: { seats: 6 },
      },
    ]);

    const interactable = listSessionGameObjects(session, {
      kind: 'furniture',
      capability: 'interactable',
    });
    expect(interactable).toHaveLength(1);
    expect(interactable[0].name).toBe('Throne');

    const royal = listSessionGameObjects(session, {
      kind: 'furniture',
      tags: ['royal'],
    });
    expect(royal).toHaveLength(1);
  });

  it('custom kind without kindData stores and retrieves fine', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'decoration',
        id: 'banner_1',
        ref: 'decoration:banner_1',
        name: 'Guild Banner',
        runtimeKind: 'decoration',
        transform: createTransform(),
      },
    ]);

    const obj = getSessionGameObject(session, 'decoration:banner_1');
    expect(obj).toBeTruthy();
    expect(obj!.kind).toBe('decoration');
    expect(obj!.kindData).toBeUndefined();
  });
});
