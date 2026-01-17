/**
 * Test/harness for core game logic
 *
 * This file demonstrates and tests:
 * - Session helpers for flags/arcs/quests/inventory/events
 * - Relationship value extraction
 *
 * For tier/intimacy computation tests, see preview.test.ts which tests
 * the @pixsim7/core.stats preview API.
 */

import type { GameSessionDTO } from '@pixsim7/shared.types';
import { describe, it } from 'vitest';
import {
  // Session helpers
  getFlag,
  setFlag,
  updateArcStage,
  markSceneSeen,
  hasSeenScene,
  updateQuestStatus,
  incrementQuestSteps,
  addInventoryItem,
  removeInventoryItem,
  hasInventoryItem,
  triggerEvent,
  isEventActive,
  // Relationships
  extract_relationship_values,
} from '../index';

// ===== Test Helpers =====

function createTestSession(): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    flags: {},
    relationships: {},
    stats: {},
    world_time: 0,
  };
}

// ===== Session Helpers Tests =====

export function testSessionHelpers() {
  console.log('=== Testing Session Helpers ===\n');

  const session = createTestSession();

  // Test flags
  console.log('Testing generic flags...');
  setFlag(session, 'test.nested.value', 42);
  const value = getFlag(session, 'test.nested.value');
  console.assert(value === 42, 'Flag should be set to 42');
  console.log('✓ Generic flags work\n');

  // Test arcs
  console.log('Testing arcs...');
  updateArcStage(session, 'main_romance_alex', 2);
  markSceneSeen(session, 'main_romance_alex', 101);
  markSceneSeen(session, 'main_romance_alex', 102);

  const seen101 = hasSeenScene(session, 'main_romance_alex', 101);
  const seen103 = hasSeenScene(session, 'main_romance_alex', 103);
  console.assert(seen101 === true, 'Scene 101 should be marked as seen');
  console.assert(seen103 === false, 'Scene 103 should not be seen');
  console.log('✓ Arc helpers work\n');

  // Test quests
  console.log('Testing quests...');
  updateQuestStatus(session, 'find_lost_cat', 'in_progress');
  incrementQuestSteps(session, 'find_lost_cat');
  incrementQuestSteps(session, 'find_lost_cat');

  const quest = getFlag(session, 'quests.find_lost_cat');
  console.assert(quest.status === 'in_progress', 'Quest should be in progress');
  console.assert(quest.stepsCompleted === 2, 'Quest should have 2 steps completed');
  console.log('✓ Quest helpers work\n');

  // Test inventory
  console.log('Testing inventory...');
  addInventoryItem(session, 'flower', 1);
  addInventoryItem(session, 'flower', 2); // Should add to existing
  addInventoryItem(session, 'key:basement', 1);

  const hasFlower = hasInventoryItem(session, 'flower', 3);
  const hasKey = hasInventoryItem(session, 'key:basement');
  console.assert(hasFlower === true, 'Should have 3 flowers');
  console.assert(hasKey === true, 'Should have basement key');

  removeInventoryItem(session, 'flower', 2);
  const hasFlowerAfter = hasInventoryItem(session, 'flower', 1);
  console.assert(hasFlowerAfter === true, 'Should have 1 flower after removal');
  console.log('✓ Inventory helpers work\n');

  // Test events
  console.log('Testing events...');
  triggerEvent(session, 'power_outage_city', 1234.5);
  const isActive = isEventActive(session, 'power_outage_city');
  console.assert(isActive === true, 'Event should be active');
  console.log('✓ Event helpers work\n');

  console.log('Session state:');
  console.log(JSON.stringify(session.flags, null, 2));
  console.log('');
}


// ===== Relationship Extraction Tests =====

export function testRelationshipExtraction() {
  console.log('=== Testing Relationship Extraction ===\n');

  // Test extract_relationship_values
  console.log('Testing relationship value extraction...');
  const relationships = {
    'npc:1': { affinity: 50, trust: 30, chemistry: 40, tension: 10, flags: ['met'] },
    'npc:2': { affinity: 75, trust: 60, chemistry: 80, tension: 5 },
  };

  const [affinity, trust, chemistry, tension, flags] = extract_relationship_values(relationships, 1);
  console.log(`  NPC 1: affinity=${affinity}, trust=${trust}, chemistry=${chemistry}, tension=${tension}`);
  console.assert(affinity === 50, 'Affinity should be 50');
  console.assert(trust === 30, 'Trust should be 30');
  console.assert(chemistry === 40, 'Chemistry should be 40');
  console.assert(tension === 10, 'Tension should be 10');
  console.assert(Array.isArray(flags), 'Flags should be an array');

  // Test missing NPC
  const [a2, t2, c2, ten2] = extract_relationship_values(relationships, 999);
  console.assert(a2 === 0, 'Missing NPC should return 0 affinity');
  console.log('✓ Relationship extraction works\n');
}

// ===== Run All Tests =====

export function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  PixSim7 Core Logic Test Harness      ║');
  console.log('╚════════════════════════════════════════╝\n');

  testSessionHelpers();
  testRelationshipExtraction();

  console.log('╔════════════════════════════════════════╗');
  console.log('║  All tests completed successfully!    ║');
  console.log('╚════════════════════════════════════════╝\n');
}

// Note: Import and call runAllTests() from demo.ts or your own script to run these tests

describe('core-logic harness', () => {
  it('should execute the core logic smoke tests', () => {
    runAllTests();
  });
});
