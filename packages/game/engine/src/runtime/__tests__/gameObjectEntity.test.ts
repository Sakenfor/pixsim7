import { LocationId, NpcId, WorldId } from '@pixsim7/shared.types';
import type { GameObject, Transform } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import { GameObjectEntity } from '../GameObjectEntity';

function createTransform(locationId?: number): Transform {
  return {
    worldId: WorldId(1),
    locationId: locationId != null ? LocationId(locationId) : undefined,
    position: { x: 0, y: 0 },
    space: 'world_2d',
  };
}

function npc(overrides: Partial<GameObject> = {}): GameObject {
  return {
    kind: 'npc',
    id: NpcId(2),
    ref: 'npc:2',
    name: 'Mina',
    runtimeKind: 'npc',
    transform: createTransform(5),
    tags: ['Friendly', 'guide'],
    capabilities: [
      { id: 'interactable', enabled: true },
      { id: 'dialogue_target', enabled: true },
      { id: 'quest_target', enabled: false },
    ],
    components: [{ type: 'mood', enabled: true, data: { value: 'happy' } }],
    ...overrides,
  } as GameObject;
}

describe('GameObjectEntity', () => {
  it('exposes field accessors from the wrapped POJO', () => {
    const e = GameObjectEntity.fromPOJO(npc());
    expect(e.kind).toBe('npc');
    expect(e.id).toBe(2);
    expect(e.ref).toBe('npc:2');
    expect(e.name).toBe('Mina');
    expect(e.runtimeKind).toBe('npc');
    expect(e.isKind('npc')).toBe(true);
    expect(e.isKind('item')).toBe(false);
  });

  it('defaults runtimeKind to kind when unset or blank (store parity)', () => {
    expect(GameObjectEntity.fromPOJO(npc({ runtimeKind: undefined })).runtimeKind).toBe('npc');
    expect(GameObjectEntity.fromPOJO(npc({ runtimeKind: '  ' })).runtimeKind).toBe('npc');
  });

  it('derives ref from kind:id when ref is absent', () => {
    const e = GameObjectEntity.fromPOJO(npc({ ref: undefined }));
    expect(e.ref).toBe('npc:2');
  });

  it('takes an isolated snapshot - source mutation does not leak in', () => {
    const source = npc();
    const e = GameObjectEntity.fromPOJO(source);
    source.name = 'Mutated';
    (source.tags as string[]).push('extra');
    expect(e.name).toBe('Mina');
    expect(e.tags).not.toContain('extra');
  });

  it('toPOJO returns an isolated clone, not internal state', () => {
    const e = GameObjectEntity.fromPOJO(npc());
    const a = e.toPOJO();
    const b = e.toPOJO();
    expect(a).not.toBe(b);
    a.name = 'Changed';
    expect(e.name).toBe('Mina');
    expect(e.toPOJO().name).toBe('Mina');
  });

  describe('capabilities', () => {
    it('hasCapability is strict: present and not explicitly disabled', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.hasCapability('dialogue_target')).toBe(true);
      expect(e.hasCapability('quest_target')).toBe(false); // enabled: false
      expect(e.hasCapability('navigation_blocker')).toBe(false); // absent
      expect(e.hasCapability('')).toBe(false); // empty id is not a match
    });

    it('getCapability returns the descriptor or undefined', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.getCapability('interactable')?.id).toBe('interactable');
      expect(e.getCapability('quest_target')?.enabled).toBe(false);
      expect(e.getCapability('missing')).toBeUndefined();
    });
  });

  describe('components', () => {
    it('getComponent / hasComponent resolve by type', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.getComponent('mood')?.data).toEqual({ value: 'happy' });
      expect(e.hasComponent('mood')).toBe(true);
      expect(e.hasComponent('inventory')).toBe(false);
      expect(e.getComponent('')).toBeUndefined();
    });
  });

  describe('tags', () => {
    it('hasTag / hasAllTags are case-insensitive', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.hasTag('friendly')).toBe(true);
      expect(e.hasTag('GUIDE')).toBe(true);
      expect(e.hasTag('hostile')).toBe(false);
      expect(e.hasAllTags(['FRIENDLY', 'guide'])).toBe(true);
      expect(e.hasAllTags([])).toBe(true);
      expect(e.hasAllTags(['friendly', 'missing'])).toBe(false);
    });
  });

  describe('matches (gameObjectStore query parity)', () => {
    it('filters by kind', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.matches({ kind: 'npc' })).toBe(true);
      expect(e.matches({ kind: 'item' })).toBe(false);
    });

    it('filters by locationId', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.matches({ locationId: 5 })).toBe(true);
      expect(e.matches({ locationId: 9 })).toBe(false);
    });

    it('treats empty capability filter as match-all (loose semantics)', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.matches({ capability: '' })).toBe(true);
      expect(e.matches({ capability: '   ' })).toBe(true);
      expect(e.matches({ capability: 'dialogue_target' })).toBe(true);
      expect(e.matches({ capability: 'quest_target' })).toBe(false); // disabled
      expect(e.matches({ capability: 'navigation_blocker' })).toBe(false); // absent
    });

    it('filters by tags (case-insensitive, all required)', () => {
      const e = GameObjectEntity.fromPOJO(npc());
      expect(e.matches({ tags: ['friendly'] })).toBe(true);
      expect(e.matches({ tags: ['friendly', 'missing'] })).toBe(false);
      expect(e.matches({})).toBe(true);
    });
  });

  describe('toEntityRef (per-kind strategy on the entity)', () => {
    it('builds a canonical typed ref for npc', () => {
      expect(GameObjectEntity.fromPOJO(npc()).toEntityRef()).toBe('npc:2');
    });

    it('uses runtimeKind, defaulting to kind, and keeps verbatim item ids', () => {
      const item = GameObjectEntity.fromPOJO({
        kind: 'item',
        id: '007',
        name: 'Coin',
        transform: createTransform(),
      } as GameObject);
      expect(item.toEntityRef()).toBe('item:007');
    });

    it('numeric-normalizes custom kinds', () => {
      const vehicle = GameObjectEntity.fromPOJO({
        kind: 'vehicle',
        id: 'shuttle_1',
        name: 'Shuttle',
        transform: createTransform(),
      } as GameObject);
      expect(vehicle.toEntityRef()).toBe('vehicle:shuttle_1');
    });

    it('returns undefined for an unusable id', () => {
      const broken = GameObjectEntity.fromPOJO({
        kind: 'npc',
        id: '   ',
        name: 'x',
        transform: createTransform(),
      } as GameObject);
      expect(broken.toEntityRef()).toBeUndefined();
    });
  });

  it('fromPOJOs wraps a collection', () => {
    const entities = GameObjectEntity.fromPOJOs([npc(), npc({ ref: 'npc:3', id: NpcId(3) })]);
    expect(entities).toHaveLength(2);
    expect(entities.map((e) => e.ref)).toEqual(['npc:2', 'npc:3']);
  });
});
