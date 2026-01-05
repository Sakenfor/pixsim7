/**
 * Scene Executor
 *
 * Pure TypeScript class for scene graph execution and state management.
 * Extracted from useSceneRuntime to enable headless scene playback.
 *
 * This is the core class that the React hook wraps.
 */

import type {
  MediaSegment,
  Scene,
  SceneEdge,
  SceneRuntimeState,
  PlaybackMode,
} from '@pixsim7/shared.types';
import {
  evaluateEdgeConditions,
  applyEdgeEffects,
  getPlayableEdges,
  isProgression,
  advanceProgression as advanceProgressionHelper,
  selectMediaSegment as selectMediaSegmentHelper,
  getDefaultNextEdge,
} from './runtime';
import { callStackManager, bindParameters } from './callStack';

type SceneNode = Scene['nodes'][number];

// ============================================
// Types
// ============================================

export interface SceneExecutorOptions {
  /** The scene to execute */
  scene: Scene;
  /** Optional map of scenes for scene calls */
  scenes?: Record<string, Scene>;
  /** Initial state (partial) */
  initialState?: Partial<SceneRuntimeState>;
  /** Whether to auto-advance on single edges */
  autoAdvance?: boolean;
  /** Debug mode */
  debug?: boolean;
}

export interface SceneExecutorEvents {
  stateChange: { state: SceneRuntimeState; previousState: SceneRuntimeState };
  edgeChosen: { edge: SceneEdge; state: SceneRuntimeState };
  sceneCall: { targetSceneId: string; state: SceneRuntimeState };
  sceneReturn: { returnSceneId: string; state: SceneRuntimeState };
  progressionAdvanced: { index: number; state: SceneRuntimeState };
}

type EventHandler<T> = (payload: T) => void;

// ============================================
// SceneExecutor Class
// ============================================

/**
 * SceneExecutor manages scene runtime state and provides methods for scene traversal.
 *
 * This is a pure TypeScript class with no React dependencies.
 */
export class SceneExecutor {
  private _state: SceneRuntimeState;
  private _scene: Scene;
  private _scenes: Record<string, Scene>;
  private _autoAdvance: boolean;
  private _debug: boolean;
  private _handlers: Map<keyof SceneExecutorEvents, Set<EventHandler<any>>> = new Map();

  constructor(options: SceneExecutorOptions) {
    this._scene = options.scene;
    this._scenes = options.scenes ?? {};
    this._autoAdvance = options.autoAdvance ?? false;
    this._debug = options.debug ?? false;
    this._state = createSceneRuntimeState(options.scene, options.initialState);
  }

  // ============================================
  // State Access
  // ============================================

  /** Get current state (read-only) */
  get state(): Readonly<SceneRuntimeState> {
    return this._state;
  }

  /** Get current scene */
  get currentScene(): Scene {
    if (!this._state.currentSceneId) return this._scene;
    if (this._scenes[this._state.currentSceneId]) {
      return this._scenes[this._state.currentSceneId];
    }
    return this._scene;
  }

  /** Get current node */
  get currentNode(): SceneNode | undefined {
    return this.currentScene.nodes.find((n) => n.id === this._state.currentNodeId);
  }

  /** Get outgoing edges from current node */
  get outgoingEdges(): SceneEdge[] {
    return this.currentScene.edges.filter((e) => e.from === this._state.currentNodeId);
  }

  /** Get playable edges (filtered by conditions) */
  get playableEdges(): SceneEdge[] {
    return getPlayableEdges(this.currentScene, this._state);
  }

  /** Get currently selected media segment */
  get selectedSegment(): MediaSegment | undefined {
    return selectMediaSegmentHelper({ node: this.currentNode, state: this._state });
  }

  /** Get progression info if current node has progression playback */
  get progression(): Extract<PlaybackMode, { kind: 'progression' }> | undefined {
    return isProgression(this.currentNode?.playback) ? this.currentNode?.playback : undefined;
  }

  /** Check if at last progression step */
  get atLastProgression(): boolean {
    if (!this.progression) return false;
    const currentIndex = this._state.progressionIndex ?? -1;
    return currentIndex >= this.progression.segments.length - 1;
  }

  /** Get current call stack depth */
  get callDepth(): number {
    return callStackManager.depth(this._state);
  }

  // ============================================
  // State Mutations
  // ============================================

  /**
   * Set a single flag
   */
  setFlag(key: string, value: unknown): void {
    const previousState = this._state;
    this._state = {
      ...this._state,
      flags: { ...this._state.flags, [key]: value },
    };
    this.emit('stateChange', { state: this._state, previousState });
  }

  /**
   * Set multiple flags
   */
  setFlags(patch: Record<string, unknown>): void {
    const previousState = this._state;
    this._state = {
      ...this._state,
      flags: { ...this._state.flags, ...patch },
    };
    this.emit('stateChange', { state: this._state, previousState });
  }

  /**
   * Choose an edge to traverse
   */
  chooseEdge(edge: SceneEdge): void {
    const previousState = this._state;
    this._state = {
      ...this._state,
      currentNodeId: edge.to,
      flags: applyEdgeEffects(edge.effects, this._state.flags),
      progressionIndex: undefined,
    };
    this.emit('stateChange', { state: this._state, previousState });
    this.emit('edgeChosen', { edge, state: this._state });

    // Check for auto-advance after edge transition
    if (this._autoAdvance) {
      this.tryAutoAdvance();
    }
  }

  /**
   * Choose an edge by ID
   * @returns true if edge was found and traversed
   */
  chooseEdgeById(edgeId: string): boolean {
    const edge = this.currentScene.edges.find((e) => e.id === edgeId);
    if (!edge) return false;
    this.chooseEdge(edge);
    return true;
  }

  /**
   * Advance progression to next step
   */
  advanceProgression(): void {
    const previousState = this._state;
    this._state = advanceProgressionHelper(this.currentNode?.playback, this._state);
    const newIndex = this._state.progressionIndex ?? 0;
    this.emit('stateChange', { state: this._state, previousState });
    this.emit('progressionAdvanced', { index: newIndex, state: this._state });
  }

  /**
   * Execute a scene call
   * @param node Optional node to use (defaults to current node if it's a scene_call)
   * @returns true if scene call was executed
   */
  executeSceneCall(node?: SceneNode): boolean {
    const callNode = node ?? (this.currentNode?.type === 'scene_call' ? this.currentNode : null);
    if (!callNode?.targetSceneId) return false;
    if (!this._scenes[callNode.targetSceneId]) return false;

    const targetScene = this._scenes[callNode.targetSceneId];
    const previousState = this._state;

    const parameters = bindParameters(this._state, callNode.parameterBindings || {});
    const newState = callStackManager.push(
      this._state,
      callNode.targetSceneId,
      callNode.id,
      parameters,
      undefined
    );

    this._state = {
      ...newState,
      currentNodeId: targetScene.startNodeId,
    };

    this.emit('stateChange', { state: this._state, previousState });
    this.emit('sceneCall', { targetSceneId: callNode.targetSceneId, state: this._state });
    return true;
  }

  /**
   * Execute a return from scene call
   * @param node Optional node to use (defaults to current node if it's a return)
   * @returns true if return was executed
   */
  executeReturn(node?: SceneNode): boolean {
    const returnNode = node ?? (this.currentNode?.type === 'return' ? this.currentNode : null);
    if (!returnNode) return false;

    const previousState = this._state;
    const result = callStackManager.pop(this._state, returnNode.returnValues);
    if (!result) return false;

    const returnSceneId = previousState.currentSceneId ?? '';
    this._state = result.state;

    this.emit('stateChange', { state: this._state, previousState });
    this.emit('sceneReturn', { returnSceneId, state: this._state });
    return true;
  }

  /**
   * Reset to initial state
   */
  reset(initialState?: Partial<SceneRuntimeState>): void {
    const previousState = this._state;
    this._state = createSceneRuntimeState(this._scene, initialState);
    this.emit('stateChange', { state: this._state, previousState });
  }

  /**
   * Set state directly (for advanced use cases)
   */
  setState(state: SceneRuntimeState): void {
    const previousState = this._state;
    this._state = state;
    this.emit('stateChange', { state: this._state, previousState });
  }

  // ============================================
  // Auto-advance
  // ============================================

  /**
   * Try to auto-advance if conditions are met
   */
  private tryAutoAdvance(): void {
    const edge = getDefaultNextEdge({
      scene: this.currentScene,
      state: this._state,
      autoAdvance: this._autoAdvance,
      node: this.currentNode,
    });

    if (edge) {
      this.chooseEdge(edge);
    }
  }

  /**
   * Check for and execute auto-advance
   * Call this after video ends or other triggers
   */
  checkAutoAdvance(): void {
    if (this._autoAdvance) {
      this.tryAutoAdvance();
    }
  }

  // ============================================
  // Event System
  // ============================================

  /**
   * Subscribe to an event
   */
  on<K extends keyof SceneExecutorEvents>(
    event: K,
    handler: EventHandler<SceneExecutorEvents[K]>
  ): () => void {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler);

    return () => {
      this._handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof SceneExecutorEvents>(
    event: K,
    handler: EventHandler<SceneExecutorEvents[K]>
  ): void {
    this._handlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof SceneExecutorEvents>(
    event: K,
    payload: SceneExecutorEvents[K]
  ): void {
    const handlers = this._handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in SceneExecutor event handler for ${String(event)}:`, error);
        }
      });
    }

    if (this._debug) {
      console.log(`[SceneExecutor] ${String(event)}`, payload);
    }
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Clean up resources
   */
  dispose(): void {
    this._handlers.clear();
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create initial scene runtime state
 */
export function createSceneRuntimeState(
  scene: Scene,
  initialState?: Partial<SceneRuntimeState>
): SceneRuntimeState {
  return {
    currentNodeId: initialState?.currentNodeId || scene.startNodeId,
    currentSceneId: initialState?.currentSceneId || scene.id,
    flags: initialState?.flags || {},
    progressionIndex: initialState?.progressionIndex,
    activeSegmentId: initialState?.activeSegmentId,
    callStack: initialState?.callStack || [],
  };
}

/**
 * Factory function to create a SceneExecutor instance
 */
export function createSceneExecutor(options: SceneExecutorOptions): SceneExecutor {
  return new SceneExecutor(options);
}
