import { LocationId, NpcId, WorldId } from '@pixsim7/shared.types';
import type { GameObject, GameSessionDTO, Transform } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  getSessionGameObject,
  listSessionGameObjects,
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

describe('runtime game object store', () => {
  it('hydrates legacy npc and inventory flags into object views', () => {
    const session = createSession({
      npcs: {
        'npc:2': {
          name: 'Mina',
          role: 'guide',
          tags: ['friendly'],
        },
      },
      inventory: {
        items: [{ id: 'flower', qty: 2 }],
      },
    });

    const all = listSessionGameObjects(session);
    expect(all.map((object) => object.ref)).toEqual(['item:flower', 'npc:2']);

    const npc = getSessionGameObject(session, 'npc:2');
    expect(npc?.kind).toBe('npc');
    expect(npc?.capabilities?.some((capability) => capability.id === 'dialogue_target')).toBe(true);

    const item = getSessionGameObject(session, 'item:flower');
    expect(item?.kind).toBe('item');
    if (!item || item.kind !== 'item') {
      throw new Error('Expected hydrated inventory item');
    }
    expect(item.itemData.quantity).toBe(2);
  });

  it('upserts canonical game objects and keeps store addressable by ref', () => {
    const baseSession = createSession();
    const objects: GameObject[] = [
      {
        kind: 'npc',
        id: NpcId(1),
        ref: 'npc:1',
        name: 'Ari',
        runtimeKind: 'npc',
        transform: createTransform(3),
        npcData: { role: 'merchant' },
      },
      {
        kind: 'prop',
        id: 'door_a',
        ref: 'prop:door_a',
        name: 'North Door',
        runtimeKind: 'prop',
        transform: createTransform(3),
        propData: {
          propDefId: 'door',
          interactionState: 'locked',
        },
        capabilities: [{ id: 'navigation_blocker', enabled: true }],
      },
    ];

    const updated = upsertSessionGameObjects(baseSession, objects);

    const npc = getSessionGameObject(updated, 'npc:1');
    expect(npc?.name).toBe('Ari');

    const door = getSessionGameObject(updated, { kind: 'prop', id: 'door_a' });
    expect(door?.kind).toBe('prop');
    expect((updated.flags as { gameObjects?: { objects?: Record<string, unknown> } }).gameObjects?.objects?.['prop:door_a']).toBeTruthy();
  });

  it('supports filtering by kind, capability, tags, and location', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'npc',
        id: NpcId(5),
        ref: 'npc:5',
        name: 'Lena',
        runtimeKind: 'npc',
        transform: createTransform(7),
        tags: ['quest', 'town'],
        npcData: { role: 'quest_giver' },
        capabilities: [{ id: 'dialogue_target', enabled: true }],
      },
      {
        kind: 'prop',
        id: 'gate_west',
        ref: 'prop:gate_west',
        name: 'West Gate',
        runtimeKind: 'prop',
        transform: createTransform(7),
        tags: ['town'],
        propData: { propDefId: 'gate', interactionState: 'closed' },
        capabilities: [{ id: 'navigation_blocker', enabled: true }],
      },
      {
        kind: 'item',
        id: 'apple',
        ref: 'item:apple',
        name: 'Apple',
        runtimeKind: 'item',
        transform: createTransform(),
        tags: ['food'],
        itemData: { itemDefId: 'apple', quantity: 1 },
        capabilities: [{ id: 'inventory_item', enabled: true }],
      },
    ]);

    const blockers = listSessionGameObjects(session, {
      capability: 'navigation_blocker',
    });
    expect(blockers.map((object) => object.ref)).toEqual(['prop:gate_west']);

    const questActors = listSessionGameObjects(session, {
      kind: 'npc',
      locationId: 7,
      tags: ['quest'],
    });
    expect(questActors.map((object) => object.ref)).toEqual(['npc:5']);
  });

  it('mirrors canonical item objects into legacy inventory flags', () => {
    const session = upsertSessionGameObjects(createSession(), [
      {
        kind: 'item',
        id: 'potion_health',
        ref: 'item:potion_health',
        name: 'Health Potion',
        runtimeKind: 'item',
        transform: createTransform(),
        itemData: { itemDefId: 'potion_health', quantity: 3 },
      },
    ]);

    const inventory = (session.flags as { inventory?: { items?: Array<Record<string, unknown>> } }).inventory;
    expect(inventory?.items).toEqual([
      {
        id: 'potion_health',
        qty: 3,
        itemId: 'potion_health',
        quantity: 3,
      },
    ]);
  });
});
