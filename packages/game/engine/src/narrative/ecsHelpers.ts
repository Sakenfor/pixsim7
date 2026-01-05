/**
 * Narrative Runtime ECS Helpers
 *
 * Provides helper functions for managing narrative runtime state in the ECS component system.
 * Narrative state is stored at: session.flags.npcs["npc:<id>"].components.narrative
 *
 * TypeScript equivalent of: pixsim7/backend/main/domain/narrative/ecs_helpers.py
 */

import type {
  NarrativeRuntimeState,
  NarrativeProgramId,
  NodeId,
} from '@pixsim7/shared.types';
import { Ref } from '@pixsim7/ref-core';

/**
 * Session flags structure (subset needed for narrative)
 */
interface SessionFlags {
  npcs?: Record<string, {
    components?: Record<string, any>;
  }>;
  [key: string]: any;
}

/**
 * Game session (subset needed for narrative)
 */
interface GameSession {
  flags: SessionFlags;
  [key: string]: any;
}

// ============================================================================
// ECS Component Access Helpers
// ============================================================================

/**
 * Ensure NPC components structure exists in session flags
 */
function ensureNpcComponents(session: GameSession, npcId: number): Record<string, any> {
  if (!session.flags.npcs) {
    session.flags.npcs = {};
  }

  const npcKey = Ref.npc(npcId);
  if (!session.flags.npcs[npcKey]) {
    session.flags.npcs[npcKey] = { components: {} };
  }

  if (!session.flags.npcs[npcKey].components) {
    session.flags.npcs[npcKey].components = {};
  }

  return session.flags.npcs[npcKey].components!;
}

/**
 * Get narrative runtime state for an NPC
 *
 * If no state exists, returns a fresh/empty state.
 */
export function getNarrativeState(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState {
  const components = ensureNpcComponents(session, npcId);

  if (!components.narrative) {
    // Return fresh state
    return {
      activeProgramId: null,
      activeNodeId: null,
      stack: [],
      history: [],
      variables: {},
      lastStepAt: undefined,
      paused: false,
      error: undefined,
    };
  }

  return components.narrative as NarrativeRuntimeState;
}

/**
 * Set narrative runtime state for an NPC
 */
export function setNarrativeState(
  session: GameSession,
  npcId: number,
  state: NarrativeRuntimeState
): void {
  const components = ensureNpcComponents(session, npcId);
  components.narrative = state;
}

/**
 * Clear narrative runtime state for an NPC
 */
export function clearNarrativeState(
  session: GameSession,
  npcId: number
): void {
  const components = ensureNpcComponents(session, npcId);
  delete components.narrative;
}

// ============================================================================
// Program Lifecycle Helpers
// ============================================================================

/**
 * Start a new narrative program for an NPC
 *
 * If a program is already active, it will be pushed to the stack (nested program).
 */
export function startProgram(
  session: GameSession,
  npcId: number,
  programId: NarrativeProgramId,
  entryNodeId: NodeId,
  initialVariables?: Record<string, any>
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  // If there's an active program, push it to the stack
  if (state.activeProgramId && state.activeNodeId) {
    state.stack.push({
      programId: state.activeProgramId,
      nodeId: state.activeNodeId,
      pushedAt: Date.now(),
    });
  }

  // Set new active program
  state.activeProgramId = programId;
  state.activeNodeId = entryNodeId;
  state.variables = initialVariables || {};
  state.lastStepAt = Date.now();
  state.paused = false;
  state.error = undefined;

  // Add to history
  state.history.push({
    programId,
    nodeId: entryNodeId,
    timestamp: Date.now(),
  });

  // Save state
  setNarrativeState(session, npcId, state);

  return state;
}

/**
 * Finish the currently active program for an NPC
 *
 * If there are programs on the stack, pops and resumes the previous one.
 * Otherwise, clears the narrative state.
 */
export function finishProgram(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState | null {
  const state = getNarrativeState(session, npcId);

  if (!state.activeProgramId) {
    // No active program
    return null;
  }

  // Pop from stack if available
  if (state.stack.length > 0) {
    const frame = state.stack.pop()!;
    state.activeProgramId = frame.programId;
    state.activeNodeId = frame.nodeId;
    state.lastStepAt = Date.now();

    // Add resume to history
    state.history.push({
      programId: frame.programId,
      nodeId: frame.nodeId,
      timestamp: Date.now(),
    });

    setNarrativeState(session, npcId, state);
    return state;
  } else {
    // No more programs, clear state
    clearNarrativeState(session, npcId);
    return null;
  }
}

/**
 * Advance to a new node in the current program
 */
export function advanceToNode(
  session: GameSession,
  npcId: number,
  nodeId: NodeId,
  choiceId?: string,
  edgeId?: string
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  if (!state.activeProgramId) {
    throw new Error('No active program to advance');
  }

  // Update active node
  state.activeNodeId = nodeId;
  state.lastStepAt = Date.now();

  // Add to history
  state.history.push({
    programId: state.activeProgramId,
    nodeId,
    timestamp: Date.now(),
    choiceId,
    edgeId,
  });

  // Save state
  setNarrativeState(session, npcId, state);

  return state;
}

/**
 * Pause the currently active program
 */
export function pauseProgram(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  if (!state.activeProgramId) {
    throw new Error('No active program to pause');
  }

  state.paused = true;
  setNarrativeState(session, npcId, state);

  return state;
}

/**
 * Resume a paused program
 */
export function resumeProgram(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  if (!state.activeProgramId) {
    throw new Error('No active program to resume');
  }

  state.paused = false;
  setNarrativeState(session, npcId, state);

  return state;
}

/**
 * Set error state for the current program
 */
export function setError(
  session: GameSession,
  npcId: number,
  errorMessage: string,
  nodeId: NodeId
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  state.error = {
    message: errorMessage,
    nodeId,
    timestamp: Date.now(),
  };

  setNarrativeState(session, npcId, state);

  return state;
}

/**
 * Clear error state
 */
export function clearError(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);

  state.error = undefined;
  setNarrativeState(session, npcId, state);

  return state;
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Check if a program is currently active
 */
export function isProgramActive(
  session: GameSession,
  npcId: number,
  programId?: NarrativeProgramId
): boolean {
  const state = getNarrativeState(session, npcId);

  if (!state.activeProgramId) {
    return false;
  }

  if (programId) {
    return state.activeProgramId === programId;
  }

  return true;
}

/**
 * Get a program variable value
 */
export function getProgramVariable<T = any>(
  session: GameSession,
  npcId: number,
  variableName: string,
  defaultValue?: T
): T {
  const state = getNarrativeState(session, npcId);
  return state.variables[variableName] ?? defaultValue;
}

/**
 * Set a program variable value
 */
export function setProgramVariable(
  session: GameSession,
  npcId: number,
  variableName: string,
  value: any
): NarrativeRuntimeState {
  const state = getNarrativeState(session, npcId);
  state.variables[variableName] = value;
  setNarrativeState(session, npcId, state);
  return state;
}

/**
 * Check if a node has been visited in the history
 */
export function hasVisitedNode(
  session: GameSession,
  npcId: number,
  programId: NarrativeProgramId,
  nodeId: NodeId
): boolean {
  const state = getNarrativeState(session, npcId);

  for (const entry of state.history) {
    if (entry.programId === programId && entry.nodeId === nodeId) {
      return true;
    }
  }

  return false;
}

/**
 * Get the current call stack depth
 */
export function getStackDepth(
  session: GameSession,
  npcId: number
): number {
  const state = getNarrativeState(session, npcId);
  return state.stack.length;
}

/**
 * Get the currently active program ID and node ID
 */
export function getActiveProgram(
  session: GameSession,
  npcId: number
): { programId: NarrativeProgramId | null; nodeId: NodeId | null } {
  const state = getNarrativeState(session, npcId);
  return {
    programId: state.activeProgramId,
    nodeId: state.activeNodeId,
  };
}

/**
 * Get the execution history
 */
export function getHistory(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState['history'] {
  const state = getNarrativeState(session, npcId);
  return state.history;
}

/**
 * Get the call stack
 */
export function getStack(
  session: GameSession,
  npcId: number
): NarrativeRuntimeState['stack'] {
  const state = getNarrativeState(session, npcId);
  return state.stack;
}
