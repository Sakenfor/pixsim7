/**
 * narrative-npc-gating-dispatch regression suite.
 *
 * Proves narrative participant resolution is driven by the
 * `narrative_participant` capability dispatched through the shared behavior
 * registry — not by a hardcoded `kind === 'npc'` check. Covers candidate
 * precedence, the synthesized (un-materialized) path, the canonical-store path,
 * and crucially a NON-npc kind that participates purely by declaring the
 * capability.
 */
import type { GameObject, GameSessionDTO } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  NARRATIVE_PARTICIPANT_CAPABILITY,
  resolveNarrativeParticipantId,
} from '../participantResolver';

function createTestSession(objects: Record<string, GameObject> = {}): GameSessionDTO {
  return {
    id: 1,
    user_id: 1,
    scene_id: 1,
    current_node_id: 1,
    world_id: 1,
    flags:
      Object.keys(objects).length > 0
        ? { gameObjects: { schemaVersion: 1, objects } }
        : {},
    stats: {},
    world_time: 0,
    version: 1,
  } as GameSessionDTO;
}

describe('resolveNarrativeParticipantId (capability dispatch)', () => {
  it('resolves an npc participant matching the primary role', async () => {
    const session = createTestSession();
    const id = await resolveNarrativeParticipantId(session, {
      participants: [
        { role: 'bystander', kind: 'npc', id: 2 },
        { role: 'target', kind: 'npc', id: 5 },
      ],
      primaryRole: 'target',
    });
    expect(id).toBe(5);
  });

  it('falls back to any npc participant when no primary-role match', async () => {
    const session = createTestSession();
    const id = await resolveNarrativeParticipantId(session, {
      participants: [
        { role: 'witness', kind: 'item', id: 9 },
        { role: 'witness', kind: 'npc', id: 3 },
      ],
      primaryRole: 'initiator',
    });
    expect(id).toBe(3);
  });

  it('resolves from the bare target when there are no participants', async () => {
    const session = createTestSession();
    const id = await resolveNarrativeParticipantId(session, {
      target: { kind: 'npc', id: 8 },
    });
    expect(id).toBe(8);
  });

  it('resolves a ref-only npc candidate (npc:7)', async () => {
    const session = createTestSession();
    const id = await resolveNarrativeParticipantId(session, {
      participants: [{ role: 'target', ref: 'npc:7' }],
    });
    expect(id).toBe(7);
  });

  it('resolves npc candidates even when not materialized in the store', async () => {
    const session = createTestSession();
    expect(session.flags).toEqual({});
    const id = await resolveNarrativeParticipantId(session, {
      target: { kind: 'npc', id: 42 },
    });
    expect(id).toBe(42);
  });

  it('returns null for a non-narrative kind with no capability', async () => {
    const session = createTestSession();
    const id = await resolveNarrativeParticipantId(session, {
      participants: [{ role: 'target', kind: 'rock', id: 1 }],
      target: { kind: 'prop', id: 2 },
    });
    expect(id).toBeNull();
  });

  it('returns null when there is no resolvable candidate', async () => {
    const session = createTestSession();
    expect(await resolveNarrativeParticipantId(session, {})).toBeNull();
  });

  it('resolves a NON-npc kind that declares the capability (capability, not kind)', async () => {
    // A custom "creature" kind opts into the narrative runtime purely by
    // declaring narrative_participant on its canonical object — the resolver
    // must pick it up with zero npc-specific knowledge.
    const creature: GameObject = {
      kind: 'creature',
      id: '11',
      ref: 'creature:11',
      name: 'Familiar',
      runtimeKind: 'creature',
      transform: { worldId: 1, position: { x: 0, y: 0 }, space: 'world_2d' } as any,
      capabilities: [{ id: NARRATIVE_PARTICIPANT_CAPABILITY, enabled: true }],
    };
    const session = createTestSession({ 'creature:11': creature });

    const id = await resolveNarrativeParticipantId(session, {
      participants: [{ role: 'target', kind: 'creature', id: 11 }],
    });
    expect(id).toBe(11);
  });

  it('skips a stored object whose capability is disabled', async () => {
    const creature: GameObject = {
      kind: 'creature',
      id: '12',
      ref: 'creature:12',
      name: 'Mute',
      runtimeKind: 'creature',
      transform: { worldId: 1, position: { x: 0, y: 0 }, space: 'world_2d' } as any,
      capabilities: [{ id: NARRATIVE_PARTICIPANT_CAPABILITY, enabled: false }],
    };
    const session = createTestSession({ 'creature:12': creature });

    const id = await resolveNarrativeParticipantId(session, {
      participants: [{ role: 'target', kind: 'creature', id: 12 }],
    });
    expect(id).toBeNull();
  });
});
