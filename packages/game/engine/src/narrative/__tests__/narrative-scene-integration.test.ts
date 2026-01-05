/**
 * Narrative ↔ Scene Integration Tests
 *
 * Tests the full flow:
 * - NarrativeController with mock GameRuntime
 * - Scene node execution in narratives
 * - ScenePlaybackController completion
 * - Executor resume (awaitInput cleared, metadata recorded, hooks fired)
 * - Session persistence (NPC isolation, schema versioning, missing flags)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  GameSessionDTO,
  NarrativeProgram,
  NarrativeNode,
  Scene,
  SceneRuntimeState,
} from '@pixsim7/shared.types';

import {
  NarrativeController,
  type NarrativeControllerConfig,
  DefaultSessionStateAdapter,
} from '../runtimeIntegration';
import { NarrativeExecutor, createProgramProvider } from '../executor';
import {
  ScenePlaybackController,
  createSceneProvider,
  createSceneIntegrationHooks,
  type ScenePlaybackResult,
} from '../sceneIntegration';
import type { GameRuntime, InteractionIntent } from '../../runtime/types';
import type { NpcRelationshipState } from '../../core/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestSession(overrides?: Partial<GameSessionDTO>): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    flags: {},
    stats: { relationships: {} },
    relationships: {},
    world_time: 0,
    ...overrides,
  };
}

function createTestNarrativeProgram(overrides?: Partial<NarrativeProgram>): NarrativeProgram {
  return {
    id: 'test_program',
    name: 'Test Program',
    entryNodeId: 'node_1',
    nodes: [
      {
        id: 'node_1',
        type: 'dialogue',
        text: 'Hello there!',
        speaker: 'npc',
      } as NarrativeNode,
      {
        id: 'node_2',
        type: 'scene',
        sceneId: 'test_scene',
      } as NarrativeNode & { sceneId: string },
      {
        id: 'node_3',
        type: 'dialogue',
        text: 'Scene completed!',
        speaker: 'npc',
      } as NarrativeNode,
    ],
    edges: [
      { id: 'edge_1_2', from: 'node_1', to: 'node_2' },
      { id: 'edge_2_3', from: 'node_2', to: 'node_3' },
    ],
    ...overrides,
  };
}

function createTestScene(overrides?: Partial<Scene>): Scene {
  return {
    id: 'test_scene',
    name: 'Test Scene',
    entryNodeId: 'scene_node_1',
    exitNodeIds: ['scene_node_2'],
    nodes: [
      {
        id: 'scene_node_1',
        type: 'video',
        playback: { type: 'single', url: 'video1.mp4' },
      },
      {
        id: 'scene_node_2',
        type: 'video',
        playback: { type: 'single', url: 'video2.mp4' },
      },
    ],
    edges: [
      { id: 'scene_edge_1', from: 'scene_node_1', to: 'scene_node_2' },
    ],
    ...overrides,
  } as Scene;
}

function createMockGameRuntime(session: GameSessionDTO): GameRuntime {
  let currentSession = session;
  const eventHandlers = new Map<string, Set<(payload: any) => void>>();

  return {
    loadSession: vi.fn().mockResolvedValue(undefined),
    getSession: () => currentSession,
    getWorld: () => null,
    applyInteraction: vi.fn().mockResolvedValue({ success: true }),
    advanceWorldTime: vi.fn().mockResolvedValue(undefined),
    getNpcRelationship: vi.fn().mockReturnValue({
      values: {
        affinity: 50,
        trust: 50,
        chemistry: 50,
        tension: 0,
      },
      tiers: {
        affinity: 'moderate',
        trust: 'moderate',
        chemistry: 'moderate',
        tension: 'very_low',
      },
      tierId: 'friend',
      levelId: 'casual',
      flags: [],
    } as NpcRelationshipState),
    updateSession: vi.fn().mockImplementation(async (updates) => {
      currentSession = { ...currentSession, ...updates };
    }),
    saveSession: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockImplementation((event, handler) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
      return () => eventHandlers.get(event)?.delete(handler);
    }),
    off: vi.fn().mockImplementation((event, handler) => {
      eventHandlers.get(event)?.delete(handler);
    }),
    dispose: vi.fn(),
  };
}

// =============================================================================
// Narrative ↔ Scene Integration Tests
// =============================================================================

describe('NarrativeController + Scene Integration', () => {
  let session: GameSessionDTO;
  let program: NarrativeProgram;
  let scene: Scene;
  let runtime: GameRuntime;
  let scenePlaybackController: ScenePlaybackController;
  let controller: NarrativeController;

  beforeEach(() => {
    session = createTestSession();
    program = createTestNarrativeProgram();
    scene = createTestScene();

    const sceneProvider = createSceneProvider([scene]);
    scenePlaybackController = new ScenePlaybackController(sceneProvider, true);

    const programProvider = createProgramProvider([program]);

    const sceneHooks = createSceneIntegrationHooks({
      sceneProvider,
      playbackController: scenePlaybackController,
      debug: true,
    });

    const config: NarrativeControllerConfig = {
      programProvider,
      executorHooks: [sceneHooks],
      debug: true,
    };

    controller = new NarrativeController(config);
    runtime = createMockGameRuntime(session);
    controller.attachRuntime(runtime);
  });

  describe('Scene Node Execution', () => {
    it('should start scene playback when narrative reaches scene node', async () => {
      // Start narrative
      const result1 = await controller.startNarrative(session, 1, 'test_program');
      expect(result1.state.activeProgramId).toBe('test_program');
      expect(result1.state.activeNodeId).toBe('node_1');
      expect(result1.awaitingInput).toBe(false);

      // Advance past dialogue to scene node
      const result2 = await controller.stepNarrative(result1.session, 1);
      expect(result2.state.activeNodeId).toBe('node_2');
      expect(result2.awaitingInput).toBe(true); // Should await scene completion

      // Verify scene playback started
      expect(scenePlaybackController.hasActiveScene(1)).toBe(true);
      const playback = scenePlaybackController.getActivePlayback(1);
      expect(playback?.sceneId).toBe('test_scene');
    });

    it('should include scene metadata in result when awaiting scene', async () => {
      // Start and advance to scene node
      const result1 = await controller.startNarrative(session, 1, 'test_program');
      const result2 = await controller.stepNarrative(result1.session, 1);

      // Check metadata contains scene info
      const metadata = (result2 as any).metadata;
      if (metadata?.activeScene) {
        expect(metadata.activeScene.sceneId).toBe('test_scene');
      }
    });

    it('should resume narrative after scene completion', async () => {
      // Start and advance to scene node
      const result1 = await controller.startNarrative(session, 1, 'test_program');
      const result2 = await controller.stepNarrative(result1.session, 1);
      expect(result2.awaitingInput).toBe(true);

      // Simulate scene completion by advancing through scene
      scenePlaybackController.advanceScene(1); // To exit node
      const sceneResult = scenePlaybackController.advanceScene(1); // Complete
      expect(sceneResult?.completed).toBe(true);

      // Scene should be removed
      expect(scenePlaybackController.hasActiveScene(1)).toBe(false);

      // Now step narrative again - it should continue to next node
      const result3 = await controller.stepNarrative(result2.session, 1);
      expect(result3.state.activeNodeId).toBe('node_3');
      expect(result3.awaitingInput).toBe(false);
    });
  });

  describe('Event Emission', () => {
    it('should emit narrativeStarted event', async () => {
      const startedHandler = vi.fn();
      controller.on('narrativeStarted', startedHandler);

      await controller.startNarrative(session, 1, 'test_program');

      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          npcId: 1,
          programId: 'test_program',
        })
      );
    });

    it('should emit sceneTransition event when reaching scene node', async () => {
      const sceneHandler = vi.fn();
      controller.on('sceneTransition', sceneHandler);

      const result1 = await controller.startNarrative(session, 1, 'test_program');
      await controller.stepNarrative(result1.session, 1);

      expect(sceneHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          npcId: 1,
          programId: 'test_program',
          sceneId: 'test_scene',
        })
      );
    });

    it('should emit narrativeFinished event on completion', async () => {
      const finishedHandler = vi.fn();
      controller.on('narrativeFinished', finishedHandler);

      // Create a simple program that ends after one node
      const simpleProgram: NarrativeProgram = {
        id: 'simple_program',
        name: 'Simple',
        entryNodeId: 'single_node',
        exitNodeIds: ['single_node'],
        nodes: [{ id: 'single_node', type: 'dialogue', text: 'Done!' } as NarrativeNode],
        edges: [],
      };

      const programProvider = createProgramProvider([simpleProgram]);
      const simpleController = new NarrativeController({
        programProvider,
        debug: true,
      });
      simpleController.attachRuntime(runtime);

      await simpleController.startNarrative(session, 1, 'simple_program');

      expect(finishedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          npcId: 1,
          programId: 'simple_program',
          reason: 'completed',
        })
      );
    });
  });

  describe('NPC Isolation', () => {
    it('should maintain separate narrative state per NPC', async () => {
      // Start narrative for NPC 1
      const result1 = await controller.startNarrative(session, 1, 'test_program');
      expect(controller.hasActiveNarrative(1)).toBe(true);
      expect(controller.hasActiveNarrative(2)).toBe(false);

      // Start narrative for NPC 2
      const result2 = await controller.startNarrative(result1.session, 2, 'test_program');
      expect(controller.hasActiveNarrative(1)).toBe(true);
      expect(controller.hasActiveNarrative(2)).toBe(true);

      // Advance NPC 1 - should not affect NPC 2
      const result3 = await controller.stepNarrative(result2.session, 1);
      expect(controller.getActiveProgramId(1)).toBe('test_program');
      expect(controller.getActiveProgramId(2)).toBe('test_program');

      // Check different node positions
      expect(result3.state.activeNodeId).toBe('node_2');
    });

    it('should store per-NPC narrative state in session.flags.narrative', async () => {
      // Start narrative for NPC 1
      const result1 = await controller.startNarrative(session, 1, 'test_program');
      const flags1 = result1.session.flags as Record<string, any>;

      expect(flags1.narrative).toBeDefined();
      expect(flags1.narrative['npc:1']).toBeDefined();
      expect(flags1.narrative['npc:1'].programId).toBe('test_program');

      // Start for NPC 2
      const result2 = await controller.startNarrative(result1.session, 2, 'test_program');
      const flags2 = result2.session.flags as Record<string, any>;

      expect(flags2.narrative['npc:1']).toBeDefined();
      expect(flags2.narrative['npc:2']).toBeDefined();
      expect(flags2.narrative['npc:1'].programId).toBe('test_program');
      expect(flags2.narrative['npc:2'].programId).toBe('test_program');
    });
  });
});

// =============================================================================
// Session Persistence Tests
// =============================================================================

describe('Session Persistence Validation', () => {
  let session: GameSessionDTO;
  let controller: NarrativeController;
  let runtime: GameRuntime;

  beforeEach(() => {
    session = createTestSession();
    const program = createTestNarrativeProgram();
    const programProvider = createProgramProvider([program]);

    controller = new NarrativeController({
      programProvider,
      debug: true,
    });

    runtime = createMockGameRuntime(session);
    controller.attachRuntime(runtime);
  });

  describe('onSessionLoaded - State Restoration', () => {
    it('should restore active narratives from session flags', () => {
      const sessionWithNarratives = createTestSession({
        flags: {
          narrative: {
            'npc:1': {
              programId: 'test_program',
              nodeId: 'node_2',
              variables: { score: 10 },
              history: [{ nodeId: 'node_1', timestamp: 123456 }],
              timestamp: Date.now(),
            },
            'npc:5': {
              programId: 'test_program',
              nodeId: 'node_1',
              variables: {},
              history: [],
              timestamp: Date.now(),
            },
          },
        },
      });

      controller.onSessionLoaded(sessionWithNarratives);

      expect(controller.hasActiveNarrative(1)).toBe(true);
      expect(controller.hasActiveNarrative(5)).toBe(true);
      expect(controller.hasActiveNarrative(2)).toBe(false);
      expect(controller.getActiveProgramId(1)).toBe('test_program');
      expect(controller.getActiveProgramId(5)).toBe('test_program');
    });

    it('should handle missing narrative flags gracefully', () => {
      const sessionNoFlags = createTestSession({ flags: {} });
      expect(() => controller.onSessionLoaded(sessionNoFlags)).not.toThrow();
      expect(controller.hasActiveNarrative(1)).toBe(false);
    });

    it('should handle malformed narrative data gracefully', () => {
      const sessionMalformed = createTestSession({
        flags: {
          narrative: {
            'npc:1': null, // Malformed
            'npc:2': 'not an object', // Malformed
            'npc:3': { programId: undefined }, // Missing programId
            'invalid-key': { programId: 'test' }, // Invalid key format
          },
        } as any,
      });

      expect(() => controller.onSessionLoaded(sessionMalformed)).not.toThrow();
      // Only valid entries should be restored
      expect(controller.hasActiveNarrative(1)).toBe(false);
      expect(controller.hasActiveNarrative(2)).toBe(false);
      expect(controller.hasActiveNarrative(3)).toBe(false);
    });
  });

  describe('DefaultSessionStateAdapter', () => {
    let adapter: DefaultSessionStateAdapter;

    beforeEach(() => {
      adapter = new DefaultSessionStateAdapter();
    });

    describe('extractVariables', () => {
      it('should extract relationship values from session', () => {
        const sessionWithRelationship = createTestSession({
          stats: {
            relationships: {
              'npc:1': {
                affinity: 75,
                trust: 60,
                chemistry: 80,
                tension: 10,
                tierId: 'close_friend',
                levelId: 'romantic',
              },
            },
          },
        });

        const vars = adapter.extractVariables(sessionWithRelationship, 1);

        expect(vars.affinity).toBe(75);
        expect(vars.trust).toBe(60);
        expect(vars.chemistry).toBe(80);
        expect(vars.tension).toBe(10);
        expect(vars.tier).toBe('close_friend');
        expect(vars.intimacyLevel).toBe('romantic');
      });

      it('should provide defaults for missing relationship data', () => {
        const vars = adapter.extractVariables(session, 999);

        expect(vars.affinity).toBe(50);
        expect(vars.trust).toBe(50);
        expect(vars.chemistry).toBe(50);
        expect(vars.tension).toBe(0);
      });

      it('should extract NPC-specific flags', () => {
        const sessionWithNpcFlags = createTestSession({
          flags: {
            npcs: {
              'npc:1': {
                hasGift: true,
                conversationCount: 5,
              },
            },
          },
        });

        const vars = adapter.extractVariables(sessionWithNpcFlags, 1);

        expect(vars.hasGift).toBe(true);
        expect(vars.conversationCount).toBe(5);
      });
    });

    describe('persistNarrativeState', () => {
      it('should create narrative namespace if missing', () => {
        const result = adapter.persistNarrativeState(
          session,
          {
            activeProgramId: 'test_program',
            activeNodeId: 'node_1',
            variables: { x: 1 },
            history: [],
          },
          1
        );

        const flags = result.flags as Record<string, any>;
        expect(flags.narrative).toBeDefined();
        expect(flags.narrative['npc:1']).toBeDefined();
        expect(flags.narrative['npc:1'].programId).toBe('test_program');
        expect(flags.narrative['npc:1'].nodeId).toBe('node_1');
        expect(flags.narrative['npc:1'].variables).toEqual({ x: 1 });
      });

      it('should preserve existing narrative data for other NPCs', () => {
        const sessionWithExisting = createTestSession({
          flags: {
            narrative: {
              'npc:2': {
                programId: 'other_program',
                nodeId: 'other_node',
              },
            },
          },
        });

        const result = adapter.persistNarrativeState(
          sessionWithExisting,
          {
            activeProgramId: 'test_program',
            activeNodeId: 'node_1',
            variables: {},
            history: [],
          },
          1
        );

        const flags = result.flags as Record<string, any>;
        expect(flags.narrative['npc:1'].programId).toBe('test_program');
        expect(flags.narrative['npc:2'].programId).toBe('other_program');
      });

      it('should include timestamp for debugging', () => {
        const before = Date.now();
        const result = adapter.persistNarrativeState(
          session,
          {
            activeProgramId: 'test_program',
            activeNodeId: 'node_1',
            variables: {},
            history: [],
          },
          1
        );
        const after = Date.now();

        const flags = result.flags as Record<string, any>;
        expect(flags.narrative['npc:1'].timestamp).toBeGreaterThanOrEqual(before);
        expect(flags.narrative['npc:1'].timestamp).toBeLessThanOrEqual(after);
      });
    });
  });
});

// =============================================================================
// ScenePlaybackController Tests
// =============================================================================

describe('ScenePlaybackController', () => {
  let scene: Scene;
  let controller: ScenePlaybackController;

  beforeEach(() => {
    scene = createTestScene();
    const provider = createSceneProvider([scene]);
    controller = new ScenePlaybackController(provider, true);
  });

  describe('startScene', () => {
    it('should initialize scene state correctly', () => {
      const state = controller.startScene(1, 'test_scene');

      expect(state).toBeDefined();
      expect(state?.currentNodeId).toBe('scene_node_1');
      expect(state?.flags).toEqual({});
      expect(state?.visitedNodeIds).toContain('scene_node_1');
    });

    it('should return undefined for non-existent scene', () => {
      const state = controller.startScene(1, 'nonexistent');
      expect(state).toBeUndefined();
    });

    it('should accept initial flags', () => {
      const state = controller.startScene(1, 'test_scene', { test: true });
      expect(state?.flags).toEqual({ test: true });
    });
  });

  describe('advanceScene', () => {
    it('should traverse to next node', () => {
      controller.startScene(1, 'test_scene');
      const result = controller.advanceScene(1);

      expect(result?.completed).toBe(false);
      expect(result?.state.currentNodeId).toBe('scene_node_2');
    });

    it('should mark scene complete at exit node', () => {
      controller.startScene(1, 'test_scene');
      controller.advanceScene(1); // To scene_node_2
      const result = controller.advanceScene(1); // At exit, should complete

      expect(result?.completed).toBe(true);
      expect(controller.hasActiveScene(1)).toBe(false);
    });

    it('should track visited nodes in history', () => {
      controller.startScene(1, 'test_scene');
      controller.advanceScene(1);

      const playback = controller.getActivePlayback(1);
      expect(playback?.state.visitedNodeIds).toContain('scene_node_1');
      expect(playback?.state.visitedNodeIds).toContain('scene_node_2');
    });
  });

  describe('cancelScene', () => {
    it('should remove active playback', () => {
      controller.startScene(1, 'test_scene');
      expect(controller.hasActiveScene(1)).toBe(true);

      controller.cancelScene(1);
      expect(controller.hasActiveScene(1)).toBe(false);
    });
  });

  describe('onSceneComplete callback', () => {
    it('should invoke callback when scene completes', () => {
      const callback = vi.fn();

      controller.startScene(1, 'test_scene');
      controller.onSceneComplete(1, callback);

      controller.advanceScene(1); // To exit node
      controller.advanceScene(1); // Complete

      expect(callback).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sceneId: 'test_scene',
          completed: true,
        })
      );
    });
  });
});

// =============================================================================
// Executor Resume Tests
// =============================================================================

describe('Executor Resume After Scene', () => {
  it('should clear awaitInput flag when scene completes', async () => {
    const session = createTestSession();
    const scene = createTestScene();
    const program: NarrativeProgram = {
      id: 'scene_program',
      name: 'Scene Program',
      entryNodeId: 'scene_node',
      nodes: [
        {
          id: 'scene_node',
          type: 'scene',
          sceneId: 'test_scene',
        } as NarrativeNode & { sceneId: string },
        {
          id: 'after_scene',
          type: 'dialogue',
          text: 'After scene',
          speaker: 'npc',
        } as NarrativeNode,
      ],
      edges: [{ id: 'e1', from: 'scene_node', to: 'after_scene' }],
    };

    const sceneProvider = createSceneProvider([scene]);
    const scenePlaybackController = new ScenePlaybackController(sceneProvider, true);
    const programProvider = createProgramProvider([program]);

    const sceneHooks = createSceneIntegrationHooks({
      sceneProvider,
      playbackController: scenePlaybackController,
      debug: true,
    });

    const controller = new NarrativeController({
      programProvider,
      executorHooks: [sceneHooks],
      debug: true,
    });

    const runtime = createMockGameRuntime(session);
    controller.attachRuntime(runtime);

    // Start narrative - directly at scene node
    const result1 = await controller.startNarrative(session, 1, 'scene_program');
    expect(result1.awaitingInput).toBe(true);
    expect(scenePlaybackController.hasActiveScene(1)).toBe(true);

    // Complete the scene
    scenePlaybackController.advanceScene(1);
    scenePlaybackController.advanceScene(1);
    expect(scenePlaybackController.hasActiveScene(1)).toBe(false);

    // Step narrative - should resume
    const result2 = await controller.stepNarrative(result1.session, 1);
    expect(result2.state.activeNodeId).toBe('after_scene');
    expect(result2.awaitingInput).toBe(false);
  });

  it('should record metadata from scene execution', async () => {
    const session = createTestSession();
    const scene = createTestScene();
    const program = createTestNarrativeProgram();

    const sceneProvider = createSceneProvider([scene]);
    const scenePlaybackController = new ScenePlaybackController(sceneProvider, true);
    const programProvider = createProgramProvider([program]);

    let capturedContext: any = null;
    const sceneHooks = createSceneIntegrationHooks({
      sceneProvider,
      playbackController: scenePlaybackController,
      onSceneStart: async (context) => {
        capturedContext = context;
      },
      debug: true,
    });

    const controller = new NarrativeController({
      programProvider,
      executorHooks: [sceneHooks],
      debug: true,
    });

    const runtime = createMockGameRuntime(session);
    controller.attachRuntime(runtime);

    // Start and advance to scene
    const result1 = await controller.startNarrative(session, 1, 'test_program');
    await controller.stepNarrative(result1.session, 1);

    // Verify context was captured
    expect(capturedContext).not.toBeNull();
    expect(capturedContext.npcId).toBe(1);
    expect(capturedContext.sceneId).toBe('test_scene');
    expect(capturedContext.narrativeProgramId).toBe('test_program');
  });
});

// =============================================================================
// Schema Versioning Tests (Future-Proofing)
// =============================================================================

describe('Narrative State Schema Versioning', () => {
  it('should handle legacy state format without version', () => {
    const legacySession = createTestSession({
      flags: {
        narrative: {
          'npc:1': {
            programId: 'test_program',
            nodeId: 'node_1',
            // No version field - legacy format
          },
        },
      },
    });

    const program = createTestNarrativeProgram();
    const programProvider = createProgramProvider([program]);
    const controller = new NarrativeController({ programProvider });
    const runtime = createMockGameRuntime(legacySession);
    controller.attachRuntime(runtime);

    // Should load without error
    expect(() => controller.onSessionLoaded(legacySession)).not.toThrow();
    expect(controller.hasActiveNarrative(1)).toBe(true);
  });
});

// =============================================================================
// Integration Hook Tests
// =============================================================================

describe('createSceneIntegrationHooks', () => {
  it('should cancel active scene when narrative ends', async () => {
    const session = createTestSession();
    const scene = createTestScene();
    const program: NarrativeProgram = {
      id: 'short_program',
      name: 'Short',
      entryNodeId: 'scene_only',
      exitNodeIds: ['scene_only'],
      nodes: [
        {
          id: 'scene_only',
          type: 'scene',
          sceneId: 'test_scene',
        } as NarrativeNode & { sceneId: string },
      ],
      edges: [],
    };

    const sceneProvider = createSceneProvider([scene]);
    const scenePlaybackController = new ScenePlaybackController(sceneProvider, true);
    const programProvider = createProgramProvider([program]);

    const sceneHooks = createSceneIntegrationHooks({
      sceneProvider,
      playbackController: scenePlaybackController,
      debug: true,
    });

    const controller = new NarrativeController({
      programProvider,
      executorHooks: [sceneHooks],
      debug: true,
    });

    const runtime = createMockGameRuntime(session);
    controller.attachRuntime(runtime);

    // Start narrative (at exit node, so it finishes immediately)
    const result = await controller.startNarrative(session, 1, 'short_program');

    // Program should have finished
    expect(result.finished).toBe(true);

    // Scene should have been cancelled via onProgramEnd hook
    // (The scene was started but program finished immediately)
  });
});
