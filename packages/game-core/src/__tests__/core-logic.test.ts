/**
 * Test/harness for core game logic
 *
 * This file demonstrates and tests:
 * - Session helpers for flags/arcs/quests/inventory/events
 * - NPC brain state construction with persona merging
 * - Relationship computation and tier/intimacy logic
 */

import type { GameSessionDTO } from '@pixsim7/types';
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
  // NPC brain
  buildNpcBrainState,
  type NpcPersona,
  // Relationships
  extract_relationship_values,
  compute_relationship_tier,
  compute_intimacy_level,
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

// ===== NPC Brain Tests =====

export function testNpcBrain() {
  console.log('=== Testing NPC Brain Projection ===\n');

  const session = createTestSession();

  // Set up a basic relationship
  session.relationships['npc:12'] = {
    affinity: 72,
    trust: 40,
    chemistry: 55,
    tension: 10,
    flags: ['kissed_once', 'shared_secret'],
    tierId: 'close_friend', // Backend-computed
    intimacyLevelId: 'light_flirt', // Backend-computed
  };

  // Test 1: Build brain without persona (uses defaults)
  console.log('Test 1: Building brain without persona...');
  const [affinity, trust, chemistry, tension, flags] = extract_relationship_values(
    session.relationships,
    12
  );

  const brain1 = buildNpcBrainState({
    npcId: 12,
    session,
    relationship: {
      affinity,
      trust,
      chemistry,
      tension,
      flags: Array.isArray(flags) ? flags : [],
      tierId: 'close_friend',
      intimacyLevelId: 'light_flirt',
    },
  });

  console.log('Brain state (no persona):');
  console.log('  Traits:', brain1.traits);
  console.log('  Tags:', brain1.personaTags);
  console.log('  Conversation style:', brain1.conversationStyle);
  console.log('  Mood:', brain1.mood);
  console.log('  Social:', brain1.social);
  console.log('');

  // Test 2: Build brain with base persona
  console.log('Test 2: Building brain with base persona...');
  const basePersona: NpcPersona = {
    traits: {
      openness: 75,
      conscientiousness: 45,
      extraversion: 60,
      agreeableness: 80,
      neuroticism: 30,
    },
    tags: ['playful', 'romantic', 'adventurous'],
    conversation_style: 'warm',
  };

  const brain2 = buildNpcBrainState({
    npcId: 12,
    session,
    relationship: {
      affinity,
      trust,
      chemistry,
      tension,
      flags: Array.isArray(flags) ? flags : [],
      tierId: 'close_friend',
      intimacyLevelId: 'light_flirt',
    },
    persona: basePersona,
  });

  console.log('Brain state (with persona):');
  console.log('  Traits:', brain2.traits);
  console.log('  Tags:', brain2.personaTags);
  console.log('  Conversation style:', brain2.conversationStyle);
  console.log('');

  // Test 3: Build brain with session overrides
  console.log('Test 3: Building brain with session overrides...');
  session.flags.npcs = {
    'npc:12': {
      personality: {
        traits: {
          extraversion: 90, // Override base
        },
        tags: ['flirty'], // Add to base tags
      },
      conversation_style: 'playful', // Override base
    },
  };

  const brain3 = buildNpcBrainState({
    npcId: 12,
    session,
    relationship: {
      affinity,
      trust,
      chemistry,
      tension,
      flags: Array.isArray(flags) ? flags : [],
      tierId: 'close_friend',
      intimacyLevelId: 'light_flirt',
    },
    persona: basePersona,
  });

  console.log('Brain state (with session overrides):');
  console.log('  Traits:', brain3.traits);
  console.log('  Tags:', brain3.personaTags);
  console.log('  Conversation style:', brain3.conversationStyle);
  console.log('');

  console.assert(brain3.traits.extraversion === 90, 'Extraversion should be overridden to 90');
  console.assert(
    brain3.personaTags.includes('flirty'),
    'Tags should include session override "flirty"'
  );
  console.assert(
    brain3.personaTags.includes('playful'),
    'Tags should include base "playful"'
  );
  console.assert(
    brain3.conversationStyle === 'playful',
    'Conversation style should be overridden'
  );
  console.log('✓ NPC brain projection works correctly\n');
}

// ===== Relationship Computation Tests =====

export function testRelationshipComputation() {
  console.log('=== Testing Relationship Computation ===\n');

  // Test tier computation
  console.log('Testing relationship tiers...');
  const tier1 = compute_relationship_tier(5);
  const tier2 = compute_relationship_tier(35);
  const tier3 = compute_relationship_tier(65);
  const tier4 = compute_relationship_tier(85);

  console.log(`  Affinity 5 -> ${tier1}`);
  console.log(`  Affinity 35 -> ${tier2}`);
  console.log(`  Affinity 65 -> ${tier3}`);
  console.log(`  Affinity 85 -> ${tier4}`);

  console.assert(tier1 === 'stranger', 'Should be stranger');
  console.assert(tier2 === 'friend', 'Should be friend');
  console.assert(tier3 === 'close_friend', 'Should be close_friend');
  console.assert(tier4 === 'lover', 'Should be lover');
  console.log('✓ Tier computation works\n');

  // Test intimacy computation
  console.log('Testing intimacy levels...');
  const intimacy1 = compute_intimacy_level({
    affinity: 90,
    trust: 70,
    chemistry: 85,
    tension: 5,
  });
  const intimacy2 = compute_intimacy_level({
    affinity: 65,
    trust: 50,
    chemistry: 60,
    tension: 10,
  });
  const intimacy3 = compute_intimacy_level({
    affinity: 25,
    trust: 15,
    chemistry: 20,
    tension: 30,
  });

  console.log(`  High values -> ${intimacy1}`);
  console.log(`  Medium values -> ${intimacy2}`);
  console.log(`  Low values -> ${intimacy3}`);

  console.assert(intimacy1 === 'very_intimate', 'Should be very intimate');
  console.assert(intimacy2 === 'intimate', 'Should be intimate');
  console.log('✓ Intimacy computation works\n');
}

// ===== Run All Tests =====

export function runAllTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  PixSim7 Core Logic Test Harness      ║');
  console.log('╚════════════════════════════════════════╝\n');

  testSessionHelpers();
  testNpcBrain();
  testRelationshipComputation();

  console.log('╔════════════════════════════════════════╗');
  console.log('║  All tests completed successfully!    ║');
  console.log('╚════════════════════════════════════════╝\n');
}

// Note: Import and call runAllTests() from demo.ts or your own script to run these tests
