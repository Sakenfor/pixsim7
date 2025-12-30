/**
 * Scene Integration
 *
 * Bridges the narrative system with the scene runtime for media playback.
 * Handles:
 * - Scene node execution in narratives
 * - Scene completion callbacks
 * - Media selection coordination
 * - Scene-based narrative advancement
 *
 * This enables narrative programs to trigger scene playback and react
 * to scene events.
 */

import type {
  GameSessionDTO,
  Scene,
  SceneContentNode as SceneMediaNode,
  SceneRuntimeState,
  SceneEdge,
  NarrativeProgram,
  NarrativeNode,
} from '@pixsim7/shared.types';

import type { ExecutorHooks } from './executor';

import {
  selectMediaSegment,
  getPlayableEdges,
  advanceProgression,
  getDefaultNextEdge,
  isProgression,
} from '../scene/runtime';

// =============================================================================
// Scene Provider Interface
// =============================================================================

/**
 * Provider for loading scene definitions.
 */
export interface SceneProvider {
  /**
   * Load a scene by ID.
   */
  getScene(sceneId: string): Scene | undefined;

  /**
   * Check if a scene exists.
   */
  hasScene(sceneId: string): boolean;
}

/**
 * Simple in-memory scene provider.
 */
export function createSceneProvider(scenes: Scene[]): SceneProvider {
  const map = new Map<string, Scene>();
  for (const scene of scenes) {
    map.set(scene.id, scene);
  }
  return {
    getScene: (id) => map.get(id),
    hasScene: (id) => map.has(id),
  };
}

// =============================================================================
// Scene Playback Controller
// =============================================================================

/**
 * Scene playback state tracked per NPC.
 */
export interface ActiveScenePlayback {
  /** Scene being played */
  sceneId: string;
  /** Current scene runtime state */
  state: SceneRuntimeState;
  /** Whether waiting for playback completion */
  awaitingCompletion: boolean;
  /** Callback when scene completes */
  onComplete?: (session: GameSessionDTO, result: ScenePlaybackResult) => void;
}

/**
 * Result of scene playback.
 */
export interface ScenePlaybackResult {
  /** Scene that was played */
  sceneId: string;
  /** Final scene state */
  state: SceneRuntimeState;
  /** Whether playback completed normally */
  completed: boolean;
  /** Selected media segments */
  selectedMedia?: string[];
  /** Edge that was taken (if scene had choices) */
  edgeId?: string;
}

/**
 * Scene playback controller.
 * Manages scene playback state and coordinates with narrative execution.
 */
export class ScenePlaybackController {
  private sceneProvider: SceneProvider;
  private activePlaybacks: Map<number, ActiveScenePlayback> = new Map();
  private debug: boolean;

  constructor(sceneProvider: SceneProvider, debug = false) {
    this.sceneProvider = sceneProvider;
    this.debug = debug;
  }

  /**
   * Start playing a scene.
   */
  startScene(
    npcId: number,
    sceneId: string,
    initialFlags?: Record<string, any>
  ): SceneRuntimeState | undefined {
    const scene = this.sceneProvider.getScene(sceneId);
    if (!scene) {
      this.log(`Scene not found: ${sceneId}`);
      return undefined;
    }

    // Initialize scene state
    const state: SceneRuntimeState = {
      currentNodeId: scene.startNodeId,
      currentSceneId: sceneId,
      flags: initialFlags || {},
    };

    // Track active playback
    this.activePlaybacks.set(npcId, {
      sceneId,
      state,
      awaitingCompletion: false,
    });

    this.log(`Started scene ${sceneId} for NPC ${npcId}`);
    return state;
  }

  /**
   * Get current scene playback for NPC.
   */
  getActivePlayback(npcId: number): ActiveScenePlayback | undefined {
    return this.activePlaybacks.get(npcId);
  }

  /**
   * Check if NPC has active scene playback.
   */
  hasActiveScene(npcId: number): boolean {
    return this.activePlaybacks.has(npcId);
  }

  /**
   * Get current media for active scene.
   */
  getCurrentMedia(npcId: number): { url?: string } | undefined {
    const playback = this.activePlaybacks.get(npcId);
    if (!playback) return undefined;

    const scene = this.sceneProvider.getScene(playback.sceneId);
    if (!scene) return undefined;

    const node = scene.nodes.find((n: SceneMediaNode) => n.id === playback.state.currentNodeId);
    if (!node) return undefined;

    const segment = selectMediaSegment({ node, state: playback.state });
    if (!segment) return undefined;

    return {
      url: segment.url,
    };
  }

  /**
   * Advance scene playback.
   */
  advanceScene(
    npcId: number,
    input?: { edgeId?: string; choiceIndex?: number }
  ): ScenePlaybackResult | undefined {
    const playback = this.activePlaybacks.get(npcId);
    if (!playback) return undefined;

    const scene = this.sceneProvider.getScene(playback.sceneId);
    if (!scene) return undefined;

    const currentNode = scene.nodes.find((n: SceneMediaNode) => n.id === playback.state.currentNodeId);
    if (!currentNode) return undefined;

    // Check if we're in a progression and should advance within it
    if (isProgression(currentNode.playback)) {
      const totalSegments = currentNode.playback.segments.length;
      const currentIndex = playback.state.progressionIndex ?? -1;

      if (currentIndex < totalSegments - 1) {
        // Advance progression
        playback.state = advanceProgression(currentNode.playback, playback.state);
        return {
          sceneId: playback.sceneId,
          state: playback.state,
          completed: false,
        };
      }
    }

    // Get playable edges
    const playableEdges = getPlayableEdges(scene, playback.state);

    // Select edge
    let selectedEdge: SceneEdge | undefined = playableEdges[0];
    if (input?.edgeId) {
      const edge = playableEdges.find((e) => e.id === input.edgeId);
      if (edge) selectedEdge = edge;
    } else if (input?.choiceIndex !== undefined && input.choiceIndex < playableEdges.length) {
      selectedEdge = playableEdges[input.choiceIndex];
    }

    // Check for auto-advance
    if (!selectedEdge) {
      const defaultEdge = getDefaultNextEdge({
        scene,
        state: playback.state,
        autoAdvance: true,
        node: currentNode,
      });
      selectedEdge = defaultEdge;
    }

    // No edge - scene ends
    if (!selectedEdge) {
      const result: ScenePlaybackResult = {
        sceneId: playback.sceneId,
        state: playback.state,
        completed: true,
      };

      this.activePlaybacks.delete(npcId);
      playback.onComplete?.(undefined as any, result);

      return result;
    }

    // Advance to next node
    playback.state = {
      ...playback.state,
      currentNodeId: selectedEdge.to,
      progressionIndex: undefined, // Reset for new node
    };

    // Check if new node is an exit (end type node)
    const nextNode = scene.nodes.find((n: SceneMediaNode) => n.id === selectedEdge.to);
    if (nextNode?.type === 'end') {
      const result: ScenePlaybackResult = {
        sceneId: playback.sceneId,
        state: playback.state,
        completed: true,
        edgeId: selectedEdge.id,
      };

      this.activePlaybacks.delete(npcId);
      playback.onComplete?.(undefined as any, result);

      return result;
    }

    return {
      sceneId: playback.sceneId,
      state: playback.state,
      completed: false,
      edgeId: selectedEdge.id,
    };
  }

  /**
   * Cancel scene playback.
   */
  cancelScene(npcId: number): void {
    this.activePlaybacks.delete(npcId);
    this.log(`Cancelled scene for NPC ${npcId}`);
  }

  /**
   * Set completion callback for active scene.
   */
  onSceneComplete(
    npcId: number,
    callback: (session: GameSessionDTO, result: ScenePlaybackResult) => void
  ): void {
    const playback = this.activePlaybacks.get(npcId);
    if (playback) {
      playback.onComplete = callback;
    }
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[ScenePlaybackController] ${message}`);
    }
  }
}

// =============================================================================
// Narrative-Scene Integration Hooks
// =============================================================================

/**
 * Configuration for scene integration hooks.
 */
export interface SceneIntegrationConfig {
  /** Scene provider */
  sceneProvider: SceneProvider;

  /** Scene playback controller (created if not provided) */
  playbackController?: ScenePlaybackController;

  /** Callback when a scene should start */
  onSceneStart?: (context: {
    npcId: number;
    sceneId: string;
    narrativeProgramId: string;
    session: GameSessionDTO;
  }) => Promise<void>;

  /** Callback when scene completes */
  onSceneComplete?: (context: {
    npcId: number;
    sceneId: string;
    result: ScenePlaybackResult;
    session: GameSessionDTO;
  }) => Promise<GameSessionDTO>;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Create executor hooks for scene integration.
 *
 * These hooks handle:
 * - SceneNode execution (starts scene playback)
 * - Scene completion (advances narrative)
 * - Scene media coordination
 */
export function createSceneIntegrationHooks(
  config: SceneIntegrationConfig
): ExecutorHooks {
  const controller = config.playbackController ||
    new ScenePlaybackController(config.sceneProvider, config.debug);

  const log = (message: string) => {
    if (config.debug) {
      console.log(`[SceneIntegration] ${message}`);
    }
  };

  return {
    async beforeNodeExecute(context) {
      const { node, program, session, npcId } = context;

      // Handle SceneNode type
      if (node.type === 'scene') {
        const sceneNode = node as NarrativeNode & { sceneId?: string };
        const sceneId = sceneNode.sceneId || (node as any).data?.sceneId;

        if (sceneId && config.sceneProvider.hasScene(sceneId)) {
          log(`Starting scene ${sceneId} from narrative node ${node.id}`);

          // Start scene playback
          controller.startScene(npcId, sceneId);

          // Notify callback
          if (config.onSceneStart) {
            await config.onSceneStart({
              npcId,
              sceneId,
              narrativeProgramId: program.id,
              session,
            });
          }
        }
      }

      return undefined;
    },

    async afterNodeExecute(context) {
      const { node, npcId, result } = context;

      // If this was a scene node, check if scene is complete
      if (node.type === 'scene' && controller.hasActiveScene(npcId)) {
        const playback = controller.getActivePlayback(npcId);
        if (playback) {
          // Mark as awaiting scene completion
          // The result should indicate awaitInput until scene finishes
          // Note: sceneTransition is handled separately via the scene playback controller
          return {
            result: {
              ...result,
              awaitInput: true,
              // Store scene info in metadata for external handling
              metadata: {
                ...(result as any).metadata,
                activeScene: {
                  sceneId: playback.sceneId,
                  ...(controller.getCurrentMedia(npcId) || {}),
                },
              },
            } as typeof result,
          };
        }
      }

      return undefined;
    },

    async onProgramEnd(context) {
      const { npcId } = context;

      // Cancel any active scene when narrative ends
      if (controller.hasActiveScene(npcId)) {
        controller.cancelScene(npcId);
      }
    },
  };
}

// =============================================================================
// Scene-Triggered Narrative Hooks
// =============================================================================

/**
 * Scene event that can trigger narrative actions.
 */
export interface SceneEvent {
  type: 'nodeEnter' | 'nodeExit' | 'edgeTraverse' | 'sceneComplete';
  sceneId: string;
  nodeId?: string;
  edgeId?: string;
  flags?: Record<string, any>;
}

/**
 * Configuration for scene-triggered narratives.
 */
export interface SceneNarrativeTriggerConfig {
  /** Map of scene events to narrative program IDs */
  triggers: SceneNarrativeTrigger[];
}

/**
 * Trigger definition for scene-to-narrative events.
 */
export interface SceneNarrativeTrigger {
  /** Scene ID to watch */
  sceneId: string;
  /** Event type to trigger on */
  eventType: SceneEvent['type'];
  /** Optional specific node ID */
  nodeId?: string;
  /** Optional specific edge ID */
  edgeId?: string;
  /** Program ID to start */
  programId: string;
  /** Required flags */
  requiredFlags?: Record<string, any>;
}

/**
 * Scene event handler that triggers narrative programs.
 */
export class SceneNarrativeTriggerer {
  private triggers: SceneNarrativeTrigger[];
  private onTrigger?: (trigger: SceneNarrativeTrigger, event: SceneEvent) => void;

  constructor(
    config: SceneNarrativeTriggerConfig,
    onTrigger?: (trigger: SceneNarrativeTrigger, event: SceneEvent) => void
  ) {
    this.triggers = config.triggers;
    this.onTrigger = onTrigger;
  }

  /**
   * Handle a scene event and check for triggers.
   */
  handleEvent(event: SceneEvent): SceneNarrativeTrigger | undefined {
    for (const trigger of this.triggers) {
      if (this.matchesTrigger(trigger, event)) {
        this.onTrigger?.(trigger, event);
        return trigger;
      }
    }
    return undefined;
  }

  private matchesTrigger(trigger: SceneNarrativeTrigger, event: SceneEvent): boolean {
    if (trigger.sceneId !== event.sceneId) return false;
    if (trigger.eventType !== event.type) return false;
    if (trigger.nodeId && trigger.nodeId !== event.nodeId) return false;
    if (trigger.edgeId && trigger.edgeId !== event.edgeId) return false;

    // Check required flags
    if (trigger.requiredFlags && event.flags) {
      for (const [key, value] of Object.entries(trigger.requiredFlags)) {
        if (event.flags[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * Add a trigger.
   */
  addTrigger(trigger: SceneNarrativeTrigger): void {
    this.triggers.push(trigger);
  }

  /**
   * Remove triggers for a scene.
   */
  removeTriggersForScene(sceneId: string): void {
    this.triggers = this.triggers.filter((t) => t.sceneId !== sceneId);
  }
}

// =============================================================================
// Scene Media Coordinator
// =============================================================================

/**
 * Coordinates media selection between narrative and scene systems.
 * Allows narrative state to influence scene media selection.
 */
export interface SceneMediaCoordinator {
  /**
   * Get media overrides for a scene node based on narrative context.
   */
  getMediaOverrides(context: {
    sceneId: string;
    nodeId: string;
    narrativeState?: {
      variables?: Record<string, any>;
      programId?: string;
    };
    sessionFlags?: Record<string, any>;
  }): MediaOverrides | undefined;
}

/**
 * Media selection overrides.
 */
export interface MediaOverrides {
  /** Force specific segment ID */
  segmentId?: string;
  /** Filter tags to apply */
  filterTags?: string[];
  /** Selection strategy override */
  strategy?: 'random' | 'ordered' | 'pool';
}

/**
 * Rule-based media coordinator.
 */
export class RuleBasedMediaCoordinator implements SceneMediaCoordinator {
  private rules: MediaOverrideRule[] = [];

  /**
   * Add an override rule.
   */
  addRule(rule: MediaOverrideRule): void {
    this.rules.push(rule);
    // Sort by priority (higher first)
    this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  getMediaOverrides(context: {
    sceneId: string;
    nodeId: string;
    narrativeState?: {
      variables?: Record<string, any>;
      programId?: string;
    };
    sessionFlags?: Record<string, any>;
  }): MediaOverrides | undefined {
    for (const rule of this.rules) {
      if (this.matchesRule(rule, context)) {
        return rule.overrides;
      }
    }
    return undefined;
  }

  private matchesRule(
    rule: MediaOverrideRule,
    context: {
      sceneId: string;
      nodeId: string;
      narrativeState?: {
        variables?: Record<string, any>;
        programId?: string;
      };
      sessionFlags?: Record<string, any>;
    }
  ): boolean {
    if (rule.sceneId && rule.sceneId !== context.sceneId) return false;
    if (rule.nodeId && rule.nodeId !== context.nodeId) return false;
    if (rule.programId && rule.programId !== context.narrativeState?.programId) return false;

    // Check variable conditions
    if (rule.variableConditions && context.narrativeState?.variables) {
      for (const [key, value] of Object.entries(rule.variableConditions)) {
        if (context.narrativeState.variables[key] !== value) return false;
      }
    }

    // Check flag conditions
    if (rule.flagConditions && context.sessionFlags) {
      for (const [key, value] of Object.entries(rule.flagConditions)) {
        if (context.sessionFlags[key] !== value) return false;
      }
    }

    return true;
  }
}

/**
 * Media override rule definition.
 */
export interface MediaOverrideRule {
  /** Scene ID to match */
  sceneId?: string;
  /** Node ID to match */
  nodeId?: string;
  /** Program ID to match */
  programId?: string;
  /** Variable conditions */
  variableConditions?: Record<string, any>;
  /** Flag conditions */
  flagConditions?: Record<string, any>;
  /** Priority (higher = checked first) */
  priority?: number;
  /** Overrides to apply */
  overrides: MediaOverrides;
}
