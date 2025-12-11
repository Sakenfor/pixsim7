#!/usr/bin/env tsx
/**
 * Development harness for @pixsim7/game-core
 *
 * This script exercises core game logic without React or backend dependencies.
 * Useful for quick testing and validation during development.
 *
 * Run: pnpm harness
 */

import type { GameSessionDTO } from '@pixsim7/shared.types';
import type { Scene, SceneNode, SceneEdge } from '@pixsim7/shared.types';
import {
  // Session state (immutable)
  getNpcRelationshipState,
  setNpcRelationshipState,
  getArcState,
  setArcState,
  getQuestState,
  setQuestState,
  getInventory,
  addInventoryItem,
  removeInventoryItem,
  getEventState,
  setEventState,
  // Scene runtime
  evaluateEdgeConditions,
  applyEdgeEffects,
  selectMediaSegment,
  getPlayableEdges,
} from '../src/index';

// ===== Utilities =====

function log(section: string, ...args: any[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${section}`);
  console.log('='.repeat(60));
  console.log(...args);
}

function createTestSession(): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    flags: {},
    relationships: {
      'npc:12': {
        affinity: 65,
        trust: 50,
        chemistry: 70,
        tension: 15,
        flags: ['met_at_cafe', 'shared_secret'],
        tierId: 'close_friend',
        intimacyLevelId: 'intimate',
      },
      'npc:15': {
        affinity: 30,
        trust: 20,
        chemistry: 10,
        tension: 5,
        flags: [],
        tierId: 'friend',
        intimacyLevelId: null,
      },
    },
    world_time: 0,
  };
}

// ===== Test 1: Relationship Helpers =====

function testRelationshipHelpers() {
  log('Test 1: Relationship Helpers (Immutable)');

  let session = createTestSession();

  // Get relationship state
  const npc12Rel = getNpcRelationshipState(session, 12);
  console.log('\nNPC 12 relationship:');
  console.log('  Affinity:', npc12Rel?.affinity);
  console.log('  Trust:', npc12Rel?.trust);
  console.log('  Chemistry:', npc12Rel?.chemistry);
  console.log('  Tier:', npc12Rel?.tierId);
  console.log('  Intimacy:', npc12Rel?.intimacyLevelId);
  console.log('  Flags:', npc12Rel?.flags);

  // Update relationship (immutable - returns new session)
  const updatedSession = setNpcRelationshipState(session, 12, {
    affinity: 80,
    chemistry: 85,
    flags: ['met_at_cafe', 'shared_secret', 'first_kiss'],
  });

  console.log('\n✓ Original session unchanged:', (session.stats.relationships?.['npc:12'] as any)?.affinity === 65);
  console.log('✓ New session updated:', (updatedSession.stats.relationships?.['npc:12'] as any)?.affinity === 80);

  const updatedRel = getNpcRelationshipState(updatedSession, 12);
  console.log('\nUpdated NPC 12 relationship:');
  console.log('  Affinity:', updatedRel?.affinity);
  console.log('  Flags:', updatedRel?.flags);
}

// ===== Test 2: Arc/Quest/Inventory Helpers =====

function testSessionStateHelpers() {
  log('Test 2: Arc, Quest, and Inventory Helpers (Immutable)');

  let session = createTestSession();

  // Set arc state
  session = setArcState(session, 'main_romance_alex', {
    stage: 3,
    seenScenes: [101, 102, 105],
  });

  const arcState = getArcState(session, 'main_romance_alex');
  console.log('\nArc "main_romance_alex":');
  console.log('  Stage:', arcState?.stage);
  console.log('  Seen scenes:', arcState?.seenScenes);

  // Set quest state
  session = setQuestState(session, 'find_lost_cat', {
    status: 'in_progress',
    stepsCompleted: 2,
  });

  const questState = getQuestState(session, 'find_lost_cat');
  console.log('\nQuest "find_lost_cat":');
  console.log('  Status:', questState?.status);
  console.log('  Steps:', questState?.stepsCompleted);

  // Add inventory items
  session = addInventoryItem(session, 'flower', 3);
  session = addInventoryItem(session, 'key:basement', 1);
  session = addInventoryItem(session, 'flower', 2); // Should add to existing

  const inventory = getInventory(session);
  console.log('\nInventory:');
  inventory.forEach(item => {
    console.log(`  ${item.id}: ${item.qty}`);
  });

  // Remove item
  const afterRemoval = removeInventoryItem(session, 'flower', 2);
  if (afterRemoval) {
    const updatedInventory = getInventory(afterRemoval);
    console.log('\nInventory after removing 2 flowers:');
    updatedInventory.forEach(item => {
      console.log(`  ${item.id}: ${item.qty}`);
    });
  }

  // Set event state
  session = setEventState(session, 'power_outage', true, {
    triggeredAt: 1234.5,
    duration: 600,
  });

  const eventState = getEventState(session, 'power_outage');
  console.log('\nEvent "power_outage":');
  console.log('  Active:', eventState?.active);
  console.log('  Triggered at:', eventState?.triggeredAt);
  console.log('  Duration:', eventState?.duration);
}

// ===== Test 4: Scene Runtime =====

function testSceneRuntime() {
  log('Test 4: Scene Runtime (Conditions, Effects, Media Selection)');

  const session = createTestSession();

  // Create a simple test scene
  const nodes: SceneNode[] = [
    {
      id: 'start',
      type: 'video',
      label: 'Opening',
      media: [
        { id: 'seg1', url: '/videos/intro-1.mp4', tags: ['happy'] },
        { id: 'seg2', url: '/videos/intro-2.mp4', tags: ['neutral'] },
      ],
      selection: { kind: 'random' },
    },
    {
      id: 'choice',
      type: 'choice',
      label: 'Player choice',
      choices: [
        { label: 'Be friendly', targetNodeId: 'friendly' },
        { label: 'Be distant', targetNodeId: 'distant' },
      ],
    },
    {
      id: 'friendly',
      type: 'video',
      label: 'Friendly response',
    },
    {
      id: 'distant',
      type: 'video',
      label: 'Distant response',
    },
    {
      id: 'end',
      type: 'end',
      endType: 'success',
    },
  ];

  const edges: SceneEdge[] = [
    {
      id: 'e1',
      from: 'start',
      to: 'choice',
      isDefault: true,
    },
    {
      id: 'e2',
      from: 'choice',
      to: 'friendly',
      label: 'Choose friendly',
      effects: [
        { key: 'relationships.npc:12.affinity', op: 'inc', value: 5 },
        { key: 'flags.talked_friendly', op: 'set', value: true },
      ],
    },
    {
      id: 'e3',
      from: 'choice',
      to: 'distant',
      label: 'Choose distant',
      conditions: [
        { key: 'relationships.npc:12.affinity', op: 'lt', value: 50 },
      ],
      effects: [
        { key: 'relationships.npc:12.affinity', op: 'dec', value: 3 },
      ],
    },
    {
      id: 'e4',
      from: 'friendly',
      to: 'end',
      isDefault: true,
    },
    {
      id: 'e5',
      from: 'distant',
      to: 'end',
      isDefault: true,
    },
  ];

  const scene: Scene = {
    id: 'test-scene',
    title: 'Test Scene',
    nodes,
    edges,
    startNodeId: 'start',
  };

  // Test edge conditions
  console.log('\n--- Edge condition evaluation ---');
  const edge3 = edges[2]; // 'distant' edge with affinity < 50 condition

  // Build a flags object that includes the relationship value for testing
  const testFlags = {
    'relationships.npc:12.affinity': (session.stats.relationships?.['npc:12'] as any)?.affinity,
  };

  const conditionsMet = evaluateEdgeConditions(
    edge3,
    testFlags
  );

  console.log('Edge "Choose distant" conditions (affinity < 50):');
  console.log('  Session affinity for NPC 12:', (session.stats.relationships?.['npc:12'] as any)?.affinity);
  console.log('  Conditions met:', conditionsMet);

  // Test edge effects
  console.log('\n--- Edge effect application ---');
  const edge2 = edges[1]; // 'friendly' edge with affinity +5

  // applyEdgeEffects works on runtime flags, not full sessions
  // For relationship changes, you'd use setNpcRelationshipState from session/state.ts
  const initialFlags = { talked_friendly: false };
  const newFlags = applyEdgeEffects(
    edge2.effects || [],
    initialFlags
  );

  console.log('After "Choose friendly" effects on flags:');
  console.log('  Original talked_friendly:', initialFlags.talked_friendly);
  console.log('  New talked_friendly:', (newFlags as any).talked_friendly);
  console.log('  New affinity from effect:', (newFlags as any)['relationships.npc:12.affinity']);

  // Test media selection
  console.log('\n--- Media segment selection ---');
  const startNode = nodes[0];

  if (startNode.media && startNode.selection) {
    const selectedSegment = selectMediaSegment(
      startNode.media,
      startNode.selection,
      { currentNodeId: 'start', flags: {} }
    );

    console.log('Selected media segment from', startNode.media.length, 'options:');
    console.log('  Segment ID:', selectedSegment?.id);
    console.log('  URL:', selectedSegment?.url);
    console.log('  Tags:', selectedSegment?.tags);
  }

  // Test playable edges
  console.log('\n--- Playable edges from choice node ---');
  const runtimeState = {
    currentNodeId: 'choice',
    flags: testFlags,
  };

  const playableEdges = getPlayableEdges(
    scene,
    runtimeState
  );

  console.log(`Found ${playableEdges.length} playable edges:`);
  playableEdges.forEach(edge => {
    console.log(`  - ${edge.label || edge.id} (to: ${edge.to})`);
  });
}

// ===== Main =====

function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║       @pixsim7/game-core Development Harness               ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    testRelationshipHelpers();
    testSessionStateHelpers();
    testNpcBrain();
    testSceneRuntime();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║  ✓ All harness tests completed successfully!              ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Harness test failed:', error);
    process.exit(1);
  }
}

main();
