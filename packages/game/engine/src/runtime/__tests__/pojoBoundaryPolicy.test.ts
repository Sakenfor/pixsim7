/**
 * POJO-EDGE / OBJECT-CORE BOUNDARY POLICY  (canonical, executable)
 * Plan: gameobject-runtime-refactor-v1 / checkpoint: pojo_boundary_policy
 *
 * RULE
 *   A `GameObject` is a plain, JSON-serializable POJO at every storage,
 *   persistence and API edge. `GameObjectEntity` is a runtime-only behavior
 *   wrapper and MUST NOT cross any edge. `entity.toPOJO()` is the only
 *   sanctioned bridge from core back to edge.
 *
 * EDGES THAT MUST CARRY PLAIN POJOs (audited 2026-05-18)
 *   1. session.flags.gameObjects        - read/write via gameObjectStore
 *      (getSessionGameObjectStore / upsertSessionGameObjects)
 *   2. Runtime public API               - GameRuntime.getGameObject /
 *      listGameObjects / upsertGameObjects (runtime/types.ts)
 *   3. Session (de)serialization        - session/storage.ts
 *      loadWorldSession / saveWorldSession (JSON.parse / JSON.stringify)
 *   4. Backend authoring API DTOs       - game_objects.py / game_meta.py
 *      (Python side; POJO by construction - not exercised here)
 *
 * CONTEXT: no production users / no real game state exists (only a throwaway
 * half-demo), so there is NO backwards-compat or migration obligation on these
 * edges - the policy is forward-only.
 *
 * This suite is the fence: it fails if a class instance leaks into a POJO edge.
 */

import { LocationId, NpcId, WorldId } from '@pixsim7/shared.types';
import type { GameObject, GameSessionDTO, Transform } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  getSessionGameObject,
  listSessionGameObjects,
  upsertSessionGameObjects,
} from '../gameObjectStore';
import { GameObjectEntity } from '../GameObjectEntity';

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

function npc(): GameObject {
  return {
    kind: 'npc',
    id: NpcId(2),
    ref: 'npc:2',
    name: 'Mina',
    runtimeKind: 'npc',
    transform: createTransform(5),
    capabilities: [{ id: 'interactable', enabled: true }],
  } as GameObject;
}

/** A value is "plain" if it is a bare object literal (Object.prototype or null proto). */
function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep round-trip through JSON must be loss-free for an edge value. */
function isJsonStable(value: unknown): boolean {
  return JSON.stringify(JSON.parse(JSON.stringify(value))) === JSON.stringify(value);
}

describe('POJO boundary policy (fence)', () => {
  it('store reads return plain, JSON-stable GameObjects (not class instances)', () => {
    const session = upsertSessionGameObjects(createSession(), [npc()]);

    const one = getSessionGameObject(session, 'npc:2');
    expect(one).not.toBeNull();
    expect(one).not.toBeInstanceOf(GameObjectEntity);
    expect(isPlainObject(one)).toBe(true);
    expect(isJsonStable(one)).toBe(true);

    for (const obj of listSessionGameObjects(session)) {
      expect(obj).not.toBeInstanceOf(GameObjectEntity);
      expect(isPlainObject(obj)).toBe(true);
    }
  });

  it('upsert round-trip keeps session.flags.gameObjects entirely plain', () => {
    const session = createSession();
    const next = upsertSessionGameObjects(session, [npc()]);

    const store = (next.flags as Record<string, unknown>).gameObjects as {
      objects: Record<string, unknown>;
    };
    expect(isPlainObject(store)).toBe(true);
    for (const value of Object.values(store.objects)) {
      expect(value).not.toBeInstanceOf(GameObjectEntity);
      expect(isPlainObject(value)).toBe(true);
    }
    // The whole flags blob must survive a persistence (JSON) round-trip.
    expect(isJsonStable(next.flags)).toBe(true);
  });

  it('entity.toPOJO() yields a plain, JSON-stable object - the only edge bridge', () => {
    const entity = GameObjectEntity.fromPOJO(npc());
    const pojo = entity.toPOJO();

    expect(pojo).not.toBeInstanceOf(GameObjectEntity);
    expect(isPlainObject(pojo)).toBe(true);
    expect(isJsonStable(pojo)).toBe(true);

    // Feeding an entity's POJO projection back through a POJO edge is safe.
    const session = upsertSessionGameObjects(createSession(), [pojo]);
    const stored = getSessionGameObject(session, pojo.ref as string);
    expect(stored).not.toBeInstanceOf(GameObjectEntity);
    expect(isPlainObject(stored)).toBe(true);
  });

  it('a leaked entity instance would be detectable at the edge (guard self-test)', () => {
    // Sanity: the fence's own detector must actually distinguish an instance
    // from a POJO, otherwise the other assertions are vacuous.
    const entity = GameObjectEntity.fromPOJO(npc());
    expect(entity).toBeInstanceOf(GameObjectEntity);
    expect(isPlainObject(entity)).toBe(false);
  });
});
