/**
 * useSceneRuntime Hook
 *
 * React hook that wraps the SceneExecutor from @pixsim7/game.engine.
 * Provides reactive state updates and integrates with React lifecycle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MediaSegment, Scene, SceneEdge, SceneRuntimeState, PlaybackMode } from '@pixsim7/shared.types';
import {
  SceneExecutor,
  createSceneRuntimeState,
  type SceneExecutorOptions,
} from '@pixsim7/game.engine';

type SceneNode = Scene['nodes'][number];

// ============================================
// Types
// ============================================

export interface UseSceneRuntimeOptions {
  scene: Scene;
  scenes?: Record<string, Scene>;
  initialState?: Partial<SceneRuntimeState>;
  autoAdvance?: boolean;
  onStateChange?: (state: SceneRuntimeState) => void;
}

export interface UseSceneRuntimeReturn {
  state: SceneRuntimeState;
  currentScene: Scene;
  currentNode?: SceneNode;
  outgoingEdges: SceneEdge[];
  playableEdges: SceneEdge[];
  selectedSegment?: MediaSegment;
  progression?: Extract<PlaybackMode, { kind: 'progression' }>;
  atLastProgression: boolean;
  callDepth: number;
  setState: Dispatch<SetStateAction<SceneRuntimeState>>;
  reset: () => void;
  setFlag: (key: string, value: unknown) => void;
  setFlags: (patch: Record<string, unknown>) => void;
  chooseEdge: (edge: SceneEdge) => void;
  chooseEdgeById: (edgeId: string) => boolean;
  advanceProgression: () => void;
  executeSceneCall: (node?: SceneNode) => boolean;
  executeReturn: (node?: SceneNode) => boolean;
}

// ============================================
// Hook
// ============================================

/**
 * React hook for scene runtime management.
 *
 * Wraps the pure TypeScript SceneExecutor class and provides
 * reactive state updates via React useState.
 */
export function useSceneRuntime({
  scene,
  scenes,
  initialState,
  autoAdvance = false,
  onStateChange,
}: UseSceneRuntimeOptions): UseSceneRuntimeReturn {
  // Create executor with stable reference
  const executorRef = useRef<SceneExecutor | null>(null);

  // Initialize executor
  if (!executorRef.current) {
    executorRef.current = new SceneExecutor({
      scene,
      scenes,
      initialState,
      autoAdvance,
    });
  }

  const executor = executorRef.current;

  // React state that mirrors executor state
  const [state, setReactState] = useState<SceneRuntimeState>(() => executor.state);

  // Subscribe to executor state changes
  useEffect(() => {
    const unsubscribe = executor.on('stateChange', ({ state: newState }) => {
      setReactState(newState);
    });

    return unsubscribe;
  }, [executor]);

  // Notify parent of state changes
  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  // Handle scene/scenes changes - reset executor with new config
  useEffect(() => {
    // Note: For simplicity, we don't recreate the executor on scene changes
    // The caller should remount the component if scene changes significantly
  }, [scene, scenes]);

  // Derived values
  const currentScene = useMemo(() => executor.currentScene, [state.currentSceneId, scene, scenes]);
  const currentNode = useMemo(() => executor.currentNode, [state.currentNodeId, currentScene]);
  const outgoingEdges = useMemo(() => executor.outgoingEdges, [state.currentNodeId, currentScene]);
  const playableEdges = useMemo(() => executor.playableEdges, [state.currentNodeId, state.flags, currentScene]);
  const selectedSegment = useMemo(() => executor.selectedSegment, [currentNode, state.progressionIndex, state.activeSegmentId]);
  const progression = useMemo(() => executor.progression, [currentNode]);
  const atLastProgression = useMemo(() => executor.atLastProgression, [progression, state.progressionIndex]);
  const callDepth = useMemo(() => executor.callDepth, [state.callStack]);

  // Actions - delegate to executor
  const setFlag = useCallback((key: string, value: unknown) => {
    executor.setFlag(key, value);
  }, [executor]);

  const setFlags = useCallback((patch: Record<string, unknown>) => {
    executor.setFlags(patch);
  }, [executor]);

  const chooseEdge = useCallback((edge: SceneEdge) => {
    executor.chooseEdge(edge);
  }, [executor]);

  const chooseEdgeById = useCallback((edgeId: string): boolean => {
    return executor.chooseEdgeById(edgeId);
  }, [executor]);

  const advanceProgression = useCallback(() => {
    executor.advanceProgression();
  }, [executor]);

  const executeSceneCall = useCallback((node?: SceneNode): boolean => {
    return executor.executeSceneCall(node);
  }, [executor]);

  const executeReturn = useCallback((node?: SceneNode): boolean => {
    return executor.executeReturn(node);
  }, [executor]);

  const reset = useCallback(() => {
    executor.reset(initialState);
  }, [executor, initialState]);

  // Custom setState that syncs to executor
  const setState: Dispatch<SetStateAction<SceneRuntimeState>> = useCallback((action) => {
    const newState = typeof action === 'function' ? action(executor.state) : action;
    executor.setState(newState);
  }, [executor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      executor.dispose();
    };
  }, [executor]);

  return {
    state,
    currentScene,
    currentNode,
    outgoingEdges,
    playableEdges,
    selectedSegment,
    progression,
    atLastProgression,
    callDepth,
    setState,
    reset,
    setFlag,
    setFlags,
    chooseEdge,
    chooseEdgeById,
    advanceProgression,
    executeSceneCall,
    executeReturn,
  };
}

// Re-export the factory for creating initial state
export { createSceneRuntimeState };
