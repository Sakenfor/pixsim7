/**
 * Scene Runtime Hook
 *
 * Shared runtime state for scene graph playback (used by 2D/3D runtimes).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MediaSegment, Scene, SceneEdge, SceneRuntimeState } from '@pixsim7/shared.types';
import {
  advanceProgression as advanceProgressionHelper,
  applyEdgeEffects,
  bindParameters,
  callStackManager,
  getDefaultNextEdge,
  getPlayableEdges,
  isProgression,
  selectMediaSegment,
} from '@pixsim7/game.engine';

type SceneNode = Scene['nodes'][number];

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
  progression?: Extract<SceneNode['playback'], { kind: 'progression' }>;
  atLastProgression: boolean;
  callDepth: number;
  setState: Dispatch<SetStateAction<SceneRuntimeState>>;
  reset: () => void;
  setFlag: (key: string, value: any) => void;
  setFlags: (patch: Record<string, any>) => void;
  chooseEdge: (edge: SceneEdge) => void;
  chooseEdgeById: (edgeId: string) => boolean;
  advanceProgression: () => void;
  executeSceneCall: (node?: SceneNode) => boolean;
  executeReturn: (node?: SceneNode) => boolean;
}

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

export function useSceneRuntime({
  scene,
  scenes,
  initialState,
  autoAdvance = false,
  onStateChange,
}: UseSceneRuntimeOptions): UseSceneRuntimeReturn {
  const initialStateRef = useRef<SceneRuntimeState>(
    createSceneRuntimeState(scene, initialState)
  );

  const [state, setState] = useState<SceneRuntimeState>(
    () => initialStateRef.current
  );

  useEffect(() => {
    initialStateRef.current = createSceneRuntimeState(scene, initialState);
  }, [scene, initialState]);

  useEffect(() => {
    if (onStateChange) {
      onStateChange(state);
    }
  }, [state, onStateChange]);

  const currentScene: Scene = useMemo(() => {
    if (!state.currentSceneId) return scene;
    if (scenes && scenes[state.currentSceneId]) return scenes[state.currentSceneId];
    return scene;
  }, [scene, scenes, state.currentSceneId]);

  const currentNode: SceneNode | undefined = useMemo(
    () => currentScene.nodes.find((n) => n.id === state.currentNodeId),
    [currentScene, state.currentNodeId]
  );

  const outgoingEdges = useMemo(
    () => currentScene.edges.filter((e) => e.from === state.currentNodeId),
    [currentScene, state.currentNodeId]
  );

  const playableEdges = useMemo(
    () => getPlayableEdges(currentScene, state),
    [currentScene, state]
  );

  const selectedSegment = useMemo(
    () => selectMediaSegment({ node: currentNode, state }),
    [currentNode, state]
  );

  const progression = useMemo(() => {
    return isProgression(currentNode?.playback) ? currentNode?.playback : undefined;
  }, [currentNode?.playback]);

  const atLastProgression = useMemo(() => {
    if (!progression) return false;
    const currentIndex = state.progressionIndex ?? -1;
    return currentIndex >= progression.segments.length - 1;
  }, [progression, state.progressionIndex]);

  const callDepth = useMemo(() => callStackManager.depth(state), [state]);

  const setFlag = useCallback((key: string, value: any) => {
    setState((s) => ({
      ...s,
      flags: { ...s.flags, [key]: value },
    }));
  }, []);

  const setFlags = useCallback((patch: Record<string, any>) => {
    setState((s) => ({
      ...s,
      flags: { ...s.flags, ...patch },
    }));
  }, []);

  const chooseEdge = useCallback((edge: SceneEdge) => {
    setState((s) => ({
      ...s,
      currentNodeId: edge.to,
      flags: applyEdgeEffects(edge.effects, s.flags),
      progressionIndex: undefined,
    }));
  }, []);

  const chooseEdgeById = useCallback(
    (edgeId: string): boolean => {
      const edge = currentScene.edges.find((e) => e.id === edgeId);
      if (!edge) return false;
      chooseEdge(edge);
      return true;
    },
    [currentScene.edges, chooseEdge]
  );

  const advanceProgression = useCallback(() => {
    setState((s) => advanceProgressionHelper(currentNode?.playback, s));
  }, [currentNode?.playback]);

  const executeSceneCall = useCallback(
    (node?: SceneNode): boolean => {
      const callNode = node ?? (currentNode?.type === 'scene_call' ? currentNode : null);
      if (!callNode?.targetSceneId) return false;
      if (!scenes || !scenes[callNode.targetSceneId]) return false;

      const targetScene = scenes[callNode.targetSceneId];

      setState((s) => {
        const parameters = bindParameters(s, callNode.parameterBindings || {});
        const newState = callStackManager.push(
          s,
          callNode.targetSceneId as string,
          callNode.id,
          parameters,
          undefined
        );

        return {
          ...newState,
          currentNodeId: targetScene.startNodeId,
        };
      });

      return true;
    },
    [currentNode, scenes]
  );

  const executeReturn = useCallback(
    (node?: SceneNode): boolean => {
      const returnNode = node ?? (currentNode?.type === 'return' ? currentNode : null);
      if (!returnNode) return false;

      setState((s) => {
        const result = callStackManager.pop(s, returnNode.returnValues);
        if (!result) return s;
        return result.state;
      });

      return true;
    },
    [currentNode]
  );

  const reset = useCallback(() => {
    setState({ ...initialStateRef.current });
  }, []);

  useEffect(() => {
    const edge = getDefaultNextEdge({
      scene: currentScene,
      state,
      autoAdvance,
      node: currentNode,
    });

    if (edge) {
      chooseEdge(edge);
    }
  }, [autoAdvance, currentScene, currentNode, state, chooseEdge]);

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

