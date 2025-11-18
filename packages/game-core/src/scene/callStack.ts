import type { SceneCallStackFrame, SceneRuntimeState } from '@pixsim7/types';

/**
 * Scene Call Stack Manager
 *
 * Manages the call stack for scene calling, enabling:
 * - Nested scene execution
 * - Parameter passing and resolution
 * - Return value capture
 * - State preservation across calls
 */

export interface CallStackManager {
  /**
   * Push a new scene call onto the stack
   */
  push: (
    state: SceneRuntimeState,
    targetSceneId: string,
    callerNodeId: string,
    parameters: Record<string, any>,
    returnPointId?: string
  ) => SceneRuntimeState;

  /**
   * Pop from the call stack and return to caller
   */
  pop: (
    state: SceneRuntimeState,
    returnValues?: Record<string, any>
  ) => { state: SceneRuntimeState; returnNodeId?: string } | null;

  /**
   * Get current call depth
   */
  depth: (state: SceneRuntimeState) => number;

  /**
   * Resolve a parameter from the current call context
   */
  resolveParameter: (state: SceneRuntimeState, key: string) => any;

  /**
   * Get the current scene ID
   */
  getCurrentSceneId: (state: SceneRuntimeState) => string | undefined;
}

export const callStackManager: CallStackManager = {
  push: (state, targetSceneId, callerNodeId, parameters, returnPointId) => {
    const callStack = state.callStack || [];

    // Create new frame
    const frame: SceneCallStackFrame = {
      sceneId: state.currentSceneId || 'unknown',
      callerNodeId,
      returnPointId,
      parameters,
      callerState: {
        currentNodeId: state.currentNodeId,
        flags: { ...state.flags },
      },
    };

    // Push frame and transition to new scene
    return {
      ...state,
      currentSceneId: targetSceneId,
      currentNodeId: '', // Will be set to target scene's start node
      callStack: [...callStack, frame],
      progressionIndex: undefined, // Reset progression for new scene
    };
  },

  pop: (state, returnValues) => {
    const callStack = state.callStack || [];

    if (callStack.length === 0) {
      // No frames to pop - we're at the root scene
      return null;
    }

    // Pop the top frame
    const frame = callStack[callStack.length - 1];
    const remainingStack = callStack.slice(0, -1);

    // Merge return values into flags if provided
    const flags = returnValues
      ? { ...frame.callerState.flags, ...returnValues }
      : frame.callerState.flags;

    // Restore caller state
    const restoredState: SceneRuntimeState = {
      ...state,
      currentSceneId: frame.sceneId,
      currentNodeId: frame.callerNodeId, // Return to the caller node
      flags,
      callStack: remainingStack,
      progressionIndex: undefined,
    };

    return {
      state: restoredState,
      returnNodeId: frame.callerNodeId,
    };
  },

  depth: (state) => {
    return (state.callStack || []).length;
  },

  resolveParameter: (state, key) => {
    const callStack = state.callStack || [];

    if (callStack.length === 0) {
      // No call context - check flags
      return state.flags[key];
    }

    // Get current frame (top of stack)
    const currentFrame = callStack[callStack.length - 1];

    // Check parameters first, then fall back to flags
    return currentFrame.parameters[key] ?? state.flags[key];
  },

  getCurrentSceneId: (state) => {
    return state.currentSceneId;
  },
};

/**
 * Helper to bind parameters for a scene call
 * Resolves parameter values from current state/flags
 */
export function bindParameters(
  state: SceneRuntimeState,
  bindings: Record<string, string | any>
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const [paramKey, binding] of Object.entries(bindings)) {
    if (typeof binding === 'string' && binding.startsWith('$')) {
      // It's a flag reference - resolve it
      const flagKey = binding.slice(1);
      resolved[paramKey] = state.flags[flagKey];
    } else {
      // It's a literal value
      resolved[paramKey] = binding;
    }
  }

  return resolved;
}
