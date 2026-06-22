/**
 * npc-ecs-canonical regression suite.
 *
 * Covers the migration of NPC component state (narrative runtime state + ad-hoc
 * ECS components from narrative effects) off the legacy `flags.npcs[*].components`
 * map onto the canonical npc-kind GameObject `components[]` array.
 *
 * Two layers:
 *  1. store helpers (getNpcComponentData / upsertNpcComponent / removeNpcComponent)
 *  2. narrative ecsHelpers (get/set/clearNarrativeState, in-place contract)
 *
 * Note: component-effect application is now owned by the backend
 * NarrativeRuntimeEngine (services/narrative/runtime.py _apply_effects); the
 * retired frontend effectApplicator coverage was removed with it.
 */
import type { GameSessionDTO } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  getNpcComponentData,
  removeNpcComponent,
  upsertNpcComponent,
} from '../gameObjectStore';
import {
  clearNarrativeState,
  getNarrativeState,
  setNarrativeState,
  startProgram,
} from '../../narrative/ecsHelpers';

function createTestSession(): GameSessionDTO {
  return {
    id: 1,
    user_id: 1,
    scene_id: 1,
    current_node_id: 1,
    world_id: 1,
    flags: {},
    stats: {},
    world_time: 0,
    version: 1,
  } as GameSessionDTO;
}

function canonicalComponent(
  session: GameSessionDTO,
  npcId: number,
  type: string
): { type: string; enabled?: boolean; data?: Record<string, unknown> } | undefined {
  const flags = session.flags as Record<string, any>;
  const obj = flags.gameObjects?.objects?.[`npc:${npcId}`];
  return (obj?.components ?? []).find((c: any) => c.type === type);
}

describe('npc component store helpers (canonical)', () => {
  it('upsert creates the npc GameObject and a typed component entry', () => {
    let session = createTestSession();
    session = upsertNpcComponent(session, 7, 'mood', { happiness: 80 });

    const flags = session.flags as Record<string, any>;
    const obj = flags.gameObjects?.objects?.['npc:7'];
    expect(obj).toBeDefined();
    expect(obj.kind).toBe('npc');
    expect(obj.ref).toBe('npc:7');
    expect(canonicalComponent(session, 7, 'mood')?.data).toEqual({ happiness: 80 });
    // Legacy location is never written.
    expect(flags.npcs).toBeUndefined();
  });

  it('upsert replaces an existing component by type (no duplicates)', () => {
    let session = createTestSession();
    session = upsertNpcComponent(session, 7, 'mood', { happiness: 80 });
    session = upsertNpcComponent(session, 7, 'mood', { happiness: 20, energy: 10 });

    const obj = (session.flags as Record<string, any>).gameObjects.objects['npc:7'];
    const moodComps = (obj.components ?? []).filter((c: any) => c.type === 'mood');
    expect(moodComps).toHaveLength(1);
    expect(moodComps[0].data).toEqual({ happiness: 20, energy: 10 });
  });

  it('getNpcComponentData returns null when absent and ignores disabled', () => {
    let session = createTestSession();
    expect(getNpcComponentData(session, 7, 'mood')).toBeNull();

    session = upsertNpcComponent(session, 7, 'mood', { happiness: 80 });
    // Mark the component disabled and confirm reads skip it.
    const obj = (session.flags as Record<string, any>).gameObjects.objects['npc:7'];
    obj.components.find((c: any) => c.type === 'mood').enabled = false;
    expect(getNpcComponentData(session, 7, 'mood')).toBeNull();
  });

  it('remove drops the component but keeps the npc GameObject', () => {
    let session = createTestSession();
    session = upsertNpcComponent(session, 7, 'mood', { happiness: 80 });
    session = upsertNpcComponent(session, 7, 'narrative', { activeProgramId: 'p1' });
    session = removeNpcComponent(session, 7, 'mood');

    expect(canonicalComponent(session, 7, 'mood')).toBeUndefined();
    expect(canonicalComponent(session, 7, 'narrative')).toBeDefined();
    expect((session.flags as Record<string, any>).gameObjects.objects['npc:7']).toBeDefined();
  });

  it('remove is a no-op when the npc or component is absent', () => {
    const session = createTestSession();
    expect(removeNpcComponent(session, 7, 'mood')).toBe(session);
  });
});

describe('narrative ecsHelpers on canonical store', () => {
  const npcId = 1;

  it('returns a fresh empty state when none persisted', () => {
    const session = createTestSession();
    const state = getNarrativeState(session, npcId);
    expect(state.activeProgramId).toBeNull();
    expect(state.stack).toEqual([]);
    expect(state.history).toEqual([]);
  });

  it('set then get round-trips through the canonical narrative component', () => {
    const session = createTestSession();
    const state = getNarrativeState(session, npcId);
    state.activeProgramId = 'prog_a' as any;
    state.variables = { mood: 'happy' };
    setNarrativeState(session, npcId, state);

    // Persisted on the canonical npc GameObject, not flags.npcs.
    expect((session.flags as Record<string, any>).npcs).toBeUndefined();
    expect(canonicalComponent(session, npcId, 'narrative')?.data?.activeProgramId).toBe('prog_a');

    const reread = getNarrativeState(session, npcId);
    expect(reread.activeProgramId).toBe('prog_a');
    expect(reread.variables).toEqual({ mood: 'happy' });
  });

  it('startProgram (in-place mutation contract) persists canonically', () => {
    const session = createTestSession();
    startProgram(session, npcId, 'prog_b' as any, 'node_1' as any, { x: 1 });

    const data = canonicalComponent(session, npcId, 'narrative')?.data as any;
    expect(data.activeProgramId).toBe('prog_b');
    expect(data.activeNodeId).toBe('node_1');
    expect(data.variables).toEqual({ x: 1 });
    expect(data.history).toHaveLength(1);
  });

  it('clear removes the narrative component', () => {
    const session = createTestSession();
    const state = getNarrativeState(session, npcId);
    state.activeProgramId = 'prog_c' as any;
    setNarrativeState(session, npcId, state);
    clearNarrativeState(session, npcId);

    expect(canonicalComponent(session, npcId, 'narrative')).toBeUndefined();
    expect(getNarrativeState(session, npcId).activeProgramId).toBeNull();
  });
});
