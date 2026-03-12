import type { GameSessionDTO } from '@pixsim7/shared.types';
import { describe, expect, it } from 'vitest';
import {
  addInventoryItem,
  extract_relationship_values,
  getFlag,
  hasInventoryItem,
  hasSeenScene,
  incrementQuestSteps,
  isEventActive,
  markSceneSeen,
  removeInventoryItem,
  setFlag,
  triggerEvent,
  updateArcStage,
  updateQuestStatus,
} from '../index';

function createTestSession(): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    world_id: 1,
    flags: {},
    stats: {},
    world_time: 0,
    version: 1,
  };
}

describe('core session helpers', () => {
  it('sets and reads nested flags', () => {
    const session = createTestSession();
    setFlag(session, 'test.nested.value', 42);
    expect(getFlag(session, 'test.nested.value')).toBe(42);
  });

  it('tracks arcs and seen scenes', () => {
    const session = createTestSession();

    updateArcStage(session, 'main_romance_alex', 2);
    markSceneSeen(session, 'main_romance_alex', 101);
    markSceneSeen(session, 'main_romance_alex', 102);

    expect(hasSeenScene(session, 'main_romance_alex', 101)).toBe(true);
    expect(hasSeenScene(session, 'main_romance_alex', 103)).toBe(false);
  });

  it('updates quests and steps', () => {
    const session = createTestSession();

    updateQuestStatus(session, 'find_lost_cat', 'in_progress');
    incrementQuestSteps(session, 'find_lost_cat');
    incrementQuestSteps(session, 'find_lost_cat');

    expect(getFlag(session, 'quests.find_lost_cat')).toEqual({
      status: 'in_progress',
      stepsCompleted: 2,
    });
  });

  it('handles inventory quantities and checks', () => {
    let session = createTestSession();

    session = addInventoryItem(session, 'flower', 1);
    session = addInventoryItem(session, 'flower', 2);
    session = addInventoryItem(session, 'key:basement', 1);

    expect(hasInventoryItem(session, 'flower', 3)).toBe(true);
    expect(hasInventoryItem(session, 'key:basement')).toBe(true);

    session = removeInventoryItem(session, 'flower', 2) ?? session;
    expect(hasInventoryItem(session, 'flower', 1)).toBe(true);
  });

  it('tracks event state transitions', () => {
    const session = createTestSession();
    triggerEvent(session, 'power_outage_city', 1234.5);
    expect(isEventActive(session, 'power_outage_city')).toBe(true);
  });
});

describe('relationship extraction', () => {
  it('extracts values and flags for known NPCs', () => {
    const relationships = {
      'npc:1': { affinity: 50, trust: 30, chemistry: 40, tension: 10, flags: ['met'] },
      'npc:2': { affinity: 75, trust: 60, chemistry: 80, tension: 5 },
    };

    const [affinity, trust, chemistry, tension, flags] = extract_relationship_values(relationships, 1);
    expect(affinity).toBe(50);
    expect(trust).toBe(30);
    expect(chemistry).toBe(40);
    expect(tension).toBe(10);
    expect(flags).toEqual(['met']);
  });

  it('returns zero defaults for missing NPCs', () => {
    const relationships = {
      'npc:1': { affinity: 50 },
    };

    const [affinity, trust, chemistry, tension, flags] = extract_relationship_values(relationships, 999);
    expect(affinity).toBe(0);
    expect(trust).toBe(0);
    expect(chemistry).toBe(0);
    expect(tension).toBe(0);
    expect(flags).toEqual([]);
  });
});
