/**
 * Interaction Chains & Sequences
 *
 * Multi-step interaction sequences that unlock progressively.
 * Useful for quests, storylines, tutorials, and relationship progression.
 */

import type { NpcInteractionDefinition } from '@pixsim7/shared.types';

/**
 * A chain of interactions that unlock sequentially
 */
export interface InteractionChain {
  /** Unique chain ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** NPC ID this chain belongs to */
  npcId: number;
  /** Ordered steps in the chain */
  steps: InteractionChainStep[];
  /** Whether the chain can be repeated after completion */
  repeatable?: boolean;
  /** How long before chain can be repeated (seconds) */
  repeatCooldownSeconds?: number;
  /** Category for organization */
  category?: 'quest' | 'romance' | 'friendship' | 'story' | 'tutorial' | 'custom';
}

/**
 * A single step in an interaction chain
 */
export interface InteractionChainStep {
  /** Step ID within the chain */
  stepId: string;
  /** Interaction definition for this step */
  interaction: NpcInteractionDefinition;
  /** Additional requirements beyond the interaction's own gating */
  additionalGating?: {
    /** Must wait this many seconds after previous step */
    minWaitSeconds?: number;
    /** Must complete before this many seconds after previous step */
    maxWaitSeconds?: number;
    /** Custom flags required for this specific step */
    requiredFlags?: string[];
  };
  /** Whether this step is optional (can be skipped) */
  optional?: boolean;
  /** Auto-advance to next step after completion? */
  autoAdvance?: boolean;
}

/**
 * Chain state tracked in session
 */
export interface ChainState {
  /** Chain ID */
  chainId: string;
  /** Current step index (0-based) */
  currentStep: number;
  /** Whether chain is completed */
  completed: boolean;
  /** Timestamp when chain started */
  startedAt: number;
  /** Timestamp of last step completion */
  lastStepAt?: number;
  /** Timestamp when chain was completed */
  completedAt?: number;
  /** Number of times completed (for repeatable chains) */
  completionCount?: number;
  /** Steps that have been completed */
  completedSteps: string[];
  /** Steps that were skipped (optional steps) */
  skippedSteps: string[];
}

/**
 * Create an interaction chain
 */
export function createChain(
  id: string,
  name: string,
  npcId: number,
  steps: InteractionChainStep[],
  options?: {
    description?: string;
    repeatable?: boolean;
    repeatCooldownSeconds?: number;
    category?: InteractionChain['category'];
  }
): InteractionChain {
  return {
    id,
    name,
    description: options?.description,
    npcId,
    steps,
    repeatable: options?.repeatable ?? false,
    repeatCooldownSeconds: options?.repeatCooldownSeconds,
    category: options?.category ?? 'custom',
  };
}

/**
 * Create a chain step
 */
export function createStep(
  stepId: string,
  interaction: NpcInteractionDefinition,
  options?: {
    minWaitSeconds?: number;
    maxWaitSeconds?: number;
    requiredFlags?: string[];
    optional?: boolean;
    autoAdvance?: boolean;
  }
): InteractionChainStep {
  return {
    stepId,
    interaction,
    additionalGating: options?.minWaitSeconds || options?.maxWaitSeconds || options?.requiredFlags
      ? {
          minWaitSeconds: options?.minWaitSeconds,
          maxWaitSeconds: options?.maxWaitSeconds,
          requiredFlags: options?.requiredFlags,
        }
      : undefined,
    optional: options?.optional ?? false,
    autoAdvance: options?.autoAdvance ?? true,
  };
}

/**
 * Get chain state from session
 */
export function getChainState(
  sessionFlags: Record<string, any>,
  chainId: string
): ChainState | null {
  const chains = sessionFlags?.chains || {};
  return chains[chainId] || null;
}

/**
 * Initialize chain state
 */
export function initializeChain(chainId: string): ChainState {
  return {
    chainId,
    currentStep: 0,
    completed: false,
    startedAt: Math.floor(Date.now() / 1000),
    completedSteps: [],
    skippedSteps: [],
  };
}

/**
 * Get current step in chain
 */
export function getCurrentStep(
  chain: InteractionChain,
  state: ChainState | null
): InteractionChainStep | null {
  if (!state || state.completed) {
    // If no state, return first step
    // If completed and not repeatable, return null
    return chain.repeatable && state?.completed ? chain.steps[0] : null;
  }

  return chain.steps[state.currentStep] || null;
}

/**
 * Check if a chain step is available
 */
export function isChainStepAvailable(
  chain: InteractionChain,
  step: InteractionChainStep,
  state: ChainState | null,
  sessionFlags: Record<string, any>,
  currentTime: number = Math.floor(Date.now() / 1000)
): { available: boolean; reason?: string } {
  // Must have state initialized
  if (!state) {
    // First step is always available if chain not started
    if (step === chain.steps[0]) {
      return { available: true };
    }
    return { available: false, reason: 'Chain not started' };
  }

  // Find step index
  const stepIndex = chain.steps.findIndex((s) => s.stepId === step.stepId);
  if (stepIndex === -1) {
    return { available: false, reason: 'Invalid step' };
  }

  // Must be current step (or chain completed and repeatable)
  if (stepIndex !== state.currentStep) {
    if (state.completed && chain.repeatable && stepIndex === 0) {
      // Check repeat cooldown
      if (chain.repeatCooldownSeconds && state.completedAt) {
        const timeSinceCompletion = currentTime - state.completedAt;
        if (timeSinceCompletion < chain.repeatCooldownSeconds) {
          const remaining = chain.repeatCooldownSeconds - timeSinceCompletion;
          return {
            available: false,
            reason: `Can repeat in ${Math.ceil(remaining / 60)} minutes`,
          };
        }
      }
      // Can repeat
      return { available: true };
    }
    return { available: false, reason: 'Not current step in chain' };
  }

  // Check additional gating
  if (step.additionalGating) {
    // Check wait time since last step
    if (step.additionalGating.minWaitSeconds && state.lastStepAt) {
      const timeSinceLastStep = currentTime - state.lastStepAt;
      if (timeSinceLastStep < step.additionalGating.minWaitSeconds) {
        const remaining = step.additionalGating.minWaitSeconds - timeSinceLastStep;
        return {
          available: false,
          reason: `Wait ${Math.ceil(remaining / 60)} more minutes`,
        };
      }
    }

    // Check max wait time
    if (step.additionalGating.maxWaitSeconds && state.lastStepAt) {
      const timeSinceLastStep = currentTime - state.lastStepAt;
      if (timeSinceLastStep > step.additionalGating.maxWaitSeconds) {
        return {
          available: false,
          reason: 'Time window expired',
        };
      }
    }

    // Check required flags
    if (step.additionalGating.requiredFlags) {
      for (const flag of step.additionalGating.requiredFlags) {
        if (!sessionFlags[flag]) {
          return {
            available: false,
            reason: `Missing requirement: ${flag}`,
          };
        }
      }
    }
  }

  return { available: true };
}

/**
 * Advance chain to next step
 */
export function advanceChain(
  chain: InteractionChain,
  state: ChainState,
  stepCompleted: string,
  skipped: boolean = false
): ChainState {
  const currentTime = Math.floor(Date.now() / 1000);
  const step = chain.steps[state.currentStep];

  if (!step || step.stepId !== stepCompleted) {
    return state; // Invalid step
  }

  // Update state
  const newState: ChainState = {
    ...state,
    lastStepAt: currentTime,
  };

  if (skipped) {
    newState.skippedSteps = [...state.skippedSteps, stepCompleted];
  } else {
    newState.completedSteps = [...state.completedSteps, stepCompleted];
  }

  // Check if auto-advance
  if (step.autoAdvance || skipped) {
    const nextStepIndex = state.currentStep + 1;

    if (nextStepIndex >= chain.steps.length) {
      // Chain completed!
      newState.completed = true;
      newState.completedAt = currentTime;
      newState.completionCount = (state.completionCount || 0) + 1;
    } else {
      newState.currentStep = nextStepIndex;
    }
  }

  return newState;
}

/**
 * Reset chain for repeat
 */
export function resetChain(chainId: string): ChainState {
  return {
    ...initializeChain(chainId),
    completionCount: 0,
  };
}

/**
 * Get chain progress (0-1)
 */
export function getChainProgress(chain: InteractionChain, state: ChainState | null): number {
  if (!state) return 0;
  if (state.completed) return 1;

  const totalSteps = chain.steps.length;
  const completedCount = state.completedSteps.length + state.skippedSteps.length;

  return completedCount / totalSteps;
}

/**
 * Get all active interactions from all chains
 */
export function getActiveChainInteractions(
  chains: InteractionChain[],
  sessionFlags: Record<string, any>,
  currentTime?: number
): Array<{
  interaction: NpcInteractionDefinition;
  chainId: string;
  stepId: string;
  chainName: string;
  isChainInteraction: true;
}> {
  const activeInteractions: Array<{
    interaction: NpcInteractionDefinition;
    chainId: string;
    stepId: string;
    chainName: string;
    isChainInteraction: true;
  }> = [];

  for (const chain of chains) {
    const state = getChainState(sessionFlags, chain.id);
    const currentStep = getCurrentStep(chain, state);

    if (currentStep) {
      const availability = isChainStepAvailable(
        chain,
        currentStep,
        state,
        sessionFlags,
        currentTime
      );

      if (availability.available) {
        // Modify interaction to include chain metadata
        const modifiedInteraction: NpcInteractionDefinition = {
          ...currentStep.interaction,
          // Override disabled message if step-specific gating blocked it
        };

        activeInteractions.push({
          interaction: modifiedInteraction,
          chainId: chain.id,
          stepId: currentStep.stepId,
          chainName: chain.name,
          isChainInteraction: true,
        });
      } else if (availability.reason) {
        // Add as unavailable with reason
        const modifiedInteraction: NpcInteractionDefinition = {
          ...currentStep.interaction,
        };

        activeInteractions.push({
          interaction: modifiedInteraction,
          chainId: chain.id,
          stepId: currentStep.stepId,
          chainName: chain.name,
          isChainInteraction: true,
        });
      }
    }
  }

  return activeInteractions;
}

/**
 * Skip an optional step
 */
export function skipChainStep(
  chain: InteractionChain,
  state: ChainState,
  stepId: string
): ChainState | null {
  const step = chain.steps[state.currentStep];

  if (!step || step.stepId !== stepId) {
    return null; // Not current step
  }

  if (!step.optional) {
    return null; // Cannot skip required step
  }

  return advanceChain(chain, state, stepId, true);
}

/**
 * Update session with new chain state
 */
export function updateChainStateInSession(
  sessionFlags: Record<string, any>,
  chainId: string,
  newState: ChainState
): Record<string, any> {
  return {
    ...sessionFlags,
    chains: {
      ...(sessionFlags.chains || {}),
      [chainId]: newState,
    },
  };
}
