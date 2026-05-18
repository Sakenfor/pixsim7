import { WorldId } from '@pixsim7/shared.types';
import type { GameObject, Transform } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import { GameObjectEntity } from '../GameObjectEntity';
import {
  GameObjectBehaviorRegistry,
  type BehaviorHandler,
} from '../gameObjectBehavior';

function transform(): Transform {
  return { worldId: WorldId(1), position: { x: 0, y: 0 }, space: 'world_2d' };
}

/** A user-defined kind - proves dispatch is genre-agnostic (not npc/item). */
function vehicle(): GameObjectEntity {
  return GameObjectEntity.fromPOJO({
    kind: 'vehicle',
    id: 'shuttle_1',
    name: 'Cargo Shuttle',
    transform: transform(),
    capabilities: [{ id: 'interactable', enabled: true }],
    components: [{ type: 'engine', enabled: true, data: { fuel: 50 } }],
  } as GameObject);
}

function plainNpc(): GameObjectEntity {
  return GameObjectEntity.fromPOJO({
    kind: 'npc',
    id: 7,
    name: 'Guard',
    transform: transform(),
    capabilities: [{ id: 'interactable', enabled: true }],
  } as GameObject);
}

const ok = (id: string): BehaviorHandler['handle'] => () => ({
  handled: true,
  result: id,
});

describe('GameObjectBehaviorRegistry', () => {
  it('resolves by capability, independent of kind (multi-genre)', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'use', capability: 'interactable', handle: ok('use') });

    // Same handler matches a custom 'vehicle' kind and an 'npc' kind alike.
    expect(reg.resolve(vehicle(), { type: 'any' }).map((h) => h.id)).toEqual(['use']);
    expect(reg.resolve(plainNpc(), { type: 'any' }).map((h) => h.id)).toEqual(['use']);
  });

  it('does not match when the capability is absent or disabled', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'quest', capability: 'quest_target', handle: ok('quest') });
    expect(reg.resolve(vehicle(), { type: 'x' })).toHaveLength(0);
  });

  it('matches by component too', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'refuel', component: 'engine', handle: ok('refuel') });
    expect(reg.resolve(vehicle(), { type: 'x' }).map((h) => h.id)).toEqual(['refuel']);
    expect(reg.resolve(plainNpc(), { type: 'x' })).toHaveLength(0);
  });

  it('narrows by intent verb when specified', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({
      id: 'talk',
      capability: 'interactable',
      intent: 'talk',
      handle: ok('talk'),
    });
    expect(reg.resolve(plainNpc(), { type: 'talk' }).map((h) => h.id)).toEqual(['talk']);
    expect(reg.resolve(plainNpc(), { type: 'use' })).toHaveLength(0);
  });

  it('orders by priority desc then registration order (override precedence)', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'base', capability: 'interactable', handle: ok('base') });
    reg.register({
      id: 'override',
      capability: 'interactable',
      priority: 10,
      handle: ok('override'),
    });
    reg.register({ id: 'base2', capability: 'interactable', handle: ok('base2') });
    expect(reg.resolve(plainNpc(), { type: 'x' }).map((h) => h.id)).toEqual([
      'override',
      'base',
      'base2',
    ]);
  });

  it('dispatch runs highest precedence and stops on handled', async () => {
    const calls: string[] = [];
    const reg = new GameObjectBehaviorRegistry();
    reg.register({
      id: 'low',
      capability: 'interactable',
      handle: () => {
        calls.push('low');
        return { handled: true, result: 'low' };
      },
    });
    reg.register({
      id: 'high',
      capability: 'interactable',
      priority: 5,
      handle: () => {
        calls.push('high');
        return { handled: true, result: 'high' };
      },
    });
    const outcome = await vehicle().dispatch(reg, { type: 'use' });
    expect(outcome).toEqual({ handled: true, result: 'high' });
    expect(calls).toEqual(['high']); // 'low' never invoked
  });

  it('chain-of-responsibility: a declining handler defers to the next', async () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({
      id: 'skip',
      capability: 'interactable',
      priority: 9,
      handle: () => ({ handled: false }),
    });
    reg.register({ id: 'take', capability: 'interactable', handle: ok('take') });
    const outcome = await plainNpc().dispatch(reg, { type: 'use' });
    expect(outcome).toEqual({ handled: true, result: 'take' });
  });

  it('returns { handled: false } when nothing applies', async () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'quest', capability: 'quest_target', handle: ok('quest') });
    expect(await vehicle().dispatch(reg, { type: 'use' })).toEqual({ handled: false });
  });

  it('register dedupes by id; unregister removes', () => {
    const reg = new GameObjectBehaviorRegistry();
    reg.register({ id: 'h', capability: 'interactable', handle: ok('v1') });
    reg.register({ id: 'h', capability: 'interactable', handle: ok('v2') });
    expect(reg.resolve(plainNpc(), { type: 'x' })).toHaveLength(1);
    expect(reg.has('h')).toBe(true);
    reg.unregister('h');
    expect(reg.has('h')).toBe(false);
    expect(reg.resolve(plainNpc(), { type: 'x' })).toHaveLength(0);
  });

  it('passes entity + host through the behavior context', async () => {
    const reg = new GameObjectBehaviorRegistry();
    let seenKind: string | undefined;
    let seenHost: unknown;
    reg.register({
      id: 'inspect',
      capability: 'interactable',
      handle: (ctx) => {
        seenKind = ctx.entity.kind;
        seenHost = ctx.host;
        return { handled: true };
      },
    });
    await vehicle().dispatch(reg, { type: 'use' }, { tick: 42 });
    expect(seenKind).toBe('vehicle');
    expect(seenHost).toEqual({ tick: 42 });
  });
});
