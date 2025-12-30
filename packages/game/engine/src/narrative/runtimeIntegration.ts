/**
 * Narrative Runtime Integration
 *
 * Bridges the NarrativeExecutor with GameRuntime via the plugin system.
 * Handles:
 * - Program resolution (which narrative to run for an interaction)
 * - Session state adaptation (GameSession ↔ NarrativeState)
 * - Effect application (narrative effects → session updates)
 * - Narrative state persistence
 * - Scene/generation coordination
 *
 * This is the main integration point between the data-driven narrative system
 * and the game runtime loop.
 */

import type {
  GameSessionDTO,
  NarrativeProgram,
  NarrativeRuntimeState,
  ExecuteInteractionResponse,
} from '@pixsim7/shared.types';

import type {
  GameRuntimePlugin,
  InteractionIntent,
  GameRuntime,
} from '../runtime/types';

import type { NpcRelationshipState } from '../core/types';

import {
  NarrativeExecutor,
  type NarrativeProgramProvider,
  type ExecutorStepResult,
  type StepInput,
  type ExecutorHooks,
} from './executor';

import { getNarrativeState } from './ecsHelpers';

// =============================================================================
// Program Resolver
// =============================================================================

/**
 * Resolver that determines which narrative program to run for a given context.
 * Implement this to define your program selection logic.
 */
export interface NarrativeProgramResolver {
  /**
   * Resolve a program ID based on the interaction context.
   *
   * @param context - Resolution context
   * @returns Program ID to run, or undefined if no program should run
   */
  resolve(context: ProgramResolutionContext): string | undefined;

  /**
   * Check if a program can be started in the current context.
   * Called after resolve() to validate program requirements.
   *
   * @param programId - Resolved program ID
   * @param context - Resolution context
   * @returns True if program can start
   */
  canStart?(programId: string, context: ProgramResolutionContext): boolean;
}

/**
 * Context passed to the program resolver.
 */
export interface ProgramResolutionContext {
  /** The interaction being executed */
  interactionId: string;
  /** NPC involved in the interaction */
  npcId: number;
  /** Current game session */
  session: GameSessionDTO;
  /** Current relationship state with the NPC */
  relationship: NpcRelationshipState | null;
  /** Active narrative state (if any) */
  narrativeState: NarrativeRuntimeState;
  /** Additional context from the interaction intent */
  intentContext?: Record<string, unknown>;
  /** Location ID if available */
  locationId?: number;
  /** Hotspot ID if triggered from a hotspot */
  hotspotId?: string;
}

/**
 * Default program resolver that uses interaction ID as program ID.
 * Override for more sophisticated resolution logic.
 */
export class DefaultProgramResolver implements NarrativeProgramResolver {
  private programProvider: NarrativeProgramProvider;

  constructor(programProvider: NarrativeProgramProvider) {
    this.programProvider = programProvider;
  }

  resolve(context: ProgramResolutionContext): string | undefined {
    // If there's an active program, continue it instead of starting new
    if (context.narrativeState.activeProgramId) {
      return undefined; // Let step() handle continuation
    }

    // Try to find a program matching the interaction ID
    const program = this.programProvider.getProgram(context.interactionId);
    if (program) {
      return context.interactionId;
    }

    // Try NPC-specific program: "npc_{npcId}_{interactionId}"
    const npcProgramId = `npc_${context.npcId}_${context.interactionId}`;
    const npcProgram = this.programProvider.getProgram(npcProgramId);
    if (npcProgram) {
      return npcProgramId;
    }

    return undefined;
  }

  canStart(programId: string, context: ProgramResolutionContext): boolean {
    const program = this.programProvider.getProgram(programId);
    if (!program) return false;

    // Check program preconditions if defined
    if (program.metadata?.preconditions) {
      // TODO: Evaluate preconditions against session state
      // For now, always allow
    }

    return true;
  }
}

/**
 * Condition-based program resolver that checks program triggers.
 */
export class ConditionBasedResolver implements NarrativeProgramResolver {
  private programProvider: NarrativeProgramProvider;
  private programTriggers: Map<string, ProgramTrigger[]> = new Map();

  constructor(programProvider: NarrativeProgramProvider) {
    this.programProvider = programProvider;
  }

  /**
   * Register a trigger for a program.
   */
  registerTrigger(programId: string, trigger: ProgramTrigger): void {
    const triggers = this.programTriggers.get(programId) || [];
    triggers.push(trigger);
    this.programTriggers.set(programId, triggers);
  }

  resolve(context: ProgramResolutionContext): string | undefined {
    // If there's an active program, continue it
    if (context.narrativeState.activeProgramId) {
      return undefined;
    }

    // Find matching program by checking triggers
    for (const [programId, triggers] of this.programTriggers) {
      for (const trigger of triggers) {
        if (this.matchesTrigger(trigger, context)) {
          return programId;
        }
      }
    }

    // Fallback to interaction-based resolution
    const program = this.programProvider.getProgram(context.interactionId);
    return program ? context.interactionId : undefined;
  }

  private matchesTrigger(trigger: ProgramTrigger, context: ProgramResolutionContext): boolean {
    // Check interaction match
    if (trigger.interactionId && trigger.interactionId !== context.interactionId) {
      return false;
    }

    // Check NPC match
    if (trigger.npcId !== undefined && trigger.npcId !== context.npcId) {
      return false;
    }

    // Check relationship tier
    if (trigger.minTier && context.relationship) {
      // Compare tier IDs (assuming numeric comparison)
      // This would need proper tier comparison logic
    }

    // Check flags
    if (trigger.requiredFlags) {
      const flags = context.session.flags as Record<string, any>;
      for (const [key, value] of Object.entries(trigger.requiredFlags)) {
        if (flags[key] !== value) {
          return false;
        }
      }
    }

    // Check excluded flags
    if (trigger.excludedFlags) {
      const flags = context.session.flags as Record<string, any>;
      for (const key of trigger.excludedFlags) {
        if (flags[key]) {
          return false;
        }
      }
    }

    return true;
  }
}

/**
 * Trigger definition for condition-based program resolution.
 */
export interface ProgramTrigger {
  /** Match specific interaction ID */
  interactionId?: string;
  /** Match specific NPC ID */
  npcId?: number;
  /** Minimum relationship tier required */
  minTier?: string;
  /** Required flags (all must be present with specified values) */
  requiredFlags?: Record<string, any>;
  /** Excluded flags (none of these can be present) */
  excludedFlags?: string[];
  /** Priority for trigger matching (higher = checked first) */
  priority?: number;
}

// =============================================================================
// Session State Adapter
// =============================================================================

/**
 * Adapts session state for narrative execution.
 * Handles extracting and merging narrative-relevant state.
 */
export interface SessionStateAdapter {
  /**
   * Extract narrative variables from session state.
   */
  extractVariables(session: GameSessionDTO, npcId: number): Record<string, any>;

  /**
   * Merge narrative result back into session.
   */
  mergeResult(
    session: GameSessionDTO,
    result: ExecutorStepResult,
    npcId: number
  ): GameSessionDTO;

  /**
   * Persist narrative state to session.
   */
  persistNarrativeState(
    session: GameSessionDTO,
    state: NarrativeRuntimeState,
    npcId: number
  ): GameSessionDTO;
}

/**
 * Default session state adapter.
 */
export class DefaultSessionStateAdapter implements SessionStateAdapter {
  extractVariables(session: GameSessionDTO, npcId: number): Record<string, any> {
    const flags = session.flags as Record<string, any>;
    const stats = session.stats as Record<string, any>;

    // Extract NPC-specific data
    const npcData = flags?.npcs?.[`npc:${npcId}`] || {};
    const npcRelationship = stats?.relationships?.[`npc:${npcId}`] || {};

    return {
      // Global session data
      worldTime: session.world_time,
      sessionId: session.id,

      // NPC relationship
      affinity: npcRelationship.affinity ?? 50,
      trust: npcRelationship.trust ?? 50,
      chemistry: npcRelationship.chemistry ?? 50,
      tension: npcRelationship.tension ?? 0,
      tier: npcRelationship.tierId,
      intimacyLevel: npcRelationship.intimacyLevelId,

      // NPC-specific flags
      ...npcData,

      // Global flags available as 'flags.{key}'
      flags: flags,
    };
  }

  mergeResult(
    session: GameSessionDTO,
    result: ExecutorStepResult,
    npcId: number
  ): GameSessionDTO {
    // The executor already applies effects to the session
    // This method handles any additional merging needed
    return result.session;
  }

  persistNarrativeState(
    session: GameSessionDTO,
    state: NarrativeRuntimeState,
    npcId: number
  ): GameSessionDTO {
    // Narrative state is already stored in session.flags via ECS helpers
    // This method handles any additional persistence needs
    const flags = { ...session.flags } as Record<string, any>;

    // Ensure narrative state is tracked
    if (!flags.narrative) {
      flags.narrative = {};
    }
    flags.narrative[`npc:${npcId}`] = {
      programId: state.activeProgramId,
      nodeId: state.activeNodeId,
      variables: state.variables,
      history: state.history,
      timestamp: Date.now(),
    };

    return {
      ...session,
      flags: flags as GameSessionDTO['flags'],
    };
  }
}

// =============================================================================
// Narrative Controller
// =============================================================================

/**
 * Configuration for NarrativeController.
 */
export interface NarrativeControllerConfig {
  /** Program provider for loading narrative programs */
  programProvider: NarrativeProgramProvider;

  /** Optional custom program resolver */
  programResolver?: NarrativeProgramResolver;

  /** Optional custom session state adapter */
  sessionAdapter?: SessionStateAdapter;

  /** Optional executor hooks (for generation integration, etc.) */
  executorHooks?: ExecutorHooks[];

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Events emitted by NarrativeController.
 */
export interface NarrativeControllerEvents {
  /** Narrative program started */
  narrativeStarted: {
    npcId: number;
    programId: string;
    session: GameSessionDTO;
  };

  /** Narrative step completed */
  narrativeStep: {
    npcId: number;
    programId: string;
    result: ExecutorStepResult;
  };

  /** Narrative program finished */
  narrativeFinished: {
    npcId: number;
    programId: string;
    session: GameSessionDTO;
    reason: 'completed' | 'error' | 'cancelled';
  };

  /** Awaiting player input */
  awaitingInput: {
    npcId: number;
    programId: string;
    choices?: ExecutorStepResult['choices'];
    display?: ExecutorStepResult['display'];
  };

  /** Scene transition requested */
  sceneTransition: {
    npcId: number;
    programId: string;
    sceneId: string;
    transition?: ExecutorStepResult['sceneTransition'];
  };
}

/**
 * NarrativeController - Main integration point between narrative and runtime.
 *
 * Implements GameRuntimePlugin to hook into the interaction flow.
 * Coordinates program resolution, execution, and state management.
 */
export class NarrativeController implements GameRuntimePlugin {
  readonly id = 'narrative-controller';
  readonly name = 'Narrative Controller';

  private config: NarrativeControllerConfig;
  private executor: NarrativeExecutor;
  private resolver: NarrativeProgramResolver;
  private adapter: SessionStateAdapter;
  private runtime: GameRuntime | null = null;

  // Event handlers
  private eventHandlers: Map<keyof NarrativeControllerEvents, Set<(payload: any) => void>> = new Map();

  // Active narrative sessions
  private activeNarratives: Map<number, {
    programId: string;
    awaitingInput: boolean;
  }> = new Map();

  constructor(config: NarrativeControllerConfig) {
    this.config = config;
    this.executor = new NarrativeExecutor(config.programProvider);
    this.resolver = config.programResolver || new DefaultProgramResolver(config.programProvider);
    this.adapter = config.sessionAdapter || new DefaultSessionStateAdapter();

    // Add configured hooks
    if (config.executorHooks) {
      for (const hooks of config.executorHooks) {
        this.executor.addHooks(hooks);
      }
    }
  }

  /**
   * Attach to a GameRuntime instance.
   */
  attachRuntime(runtime: GameRuntime): void {
    this.runtime = runtime;
    this.log('Attached to runtime');
  }

  /**
   * Detach from runtime.
   */
  detachRuntime(): void {
    this.runtime = null;
    this.activeNarratives.clear();
    this.log('Detached from runtime');
  }

  /**
   * Get the underlying executor (for direct access if needed).
   */
  getExecutor(): NarrativeExecutor {
    return this.executor;
  }

  /**
   * Check if NPC has an active narrative.
   */
  hasActiveNarrative(npcId: number): boolean {
    return this.activeNarratives.has(npcId);
  }

  /**
   * Check if NPC is awaiting input.
   */
  isAwaitingInput(npcId: number): boolean {
    return this.activeNarratives.get(npcId)?.awaitingInput ?? false;
  }

  /**
   * Get active program ID for NPC.
   */
  getActiveProgramId(npcId: number): string | undefined {
    return this.activeNarratives.get(npcId)?.programId;
  }

  // ===========================================================================
  // GameRuntimePlugin Implementation
  // ===========================================================================

  /**
   * Called when session is loaded.
   * Restores any active narrative state.
   */
  onSessionLoaded(session: GameSessionDTO): void {
    this.activeNarratives.clear();

    // Scan for active narratives in session
    const flags = session.flags as Record<string, any>;
    if (flags?.narrative) {
      for (const [key, data] of Object.entries(flags.narrative)) {
        const match = key.match(/^npc:(\d+)$/);
        if (match && data && typeof data === 'object') {
          const npcId = parseInt(match[1], 10);
          const narrativeData = data as any;
          if (narrativeData.programId) {
            this.activeNarratives.set(npcId, {
              programId: narrativeData.programId,
              awaitingInput: false, // Will be determined on first step
            });
            this.log(`Restored narrative for NPC ${npcId}: ${narrativeData.programId}`);
          }
        }
      }
    }
  }

  /**
   * Called before an interaction is applied.
   * May start or continue a narrative program.
   */
  async beforeInteraction(
    intent: InteractionIntent,
    session: GameSessionDTO
  ): Promise<boolean> {
    const { npcId, interactionId } = intent;

    // npcId is required for narrative interactions
    if (npcId === undefined) {
      this.log(`No npcId for interaction: ${interactionId}`);
      return true; // Allow regular interaction handling
    }

    // Get current narrative state
    const narrativeState = getNarrativeState(session, npcId);
    const relationship = this.runtime?.getNpcRelationship(npcId) ?? null;

    // Build resolution context
    const context: ProgramResolutionContext = {
      interactionId,
      npcId,
      session,
      relationship,
      narrativeState,
      intentContext: intent.context,
      locationId: intent.locationId,
      hotspotId: intent.hotspotId,
    };

    // Check if we should continue existing narrative or start new one
    if (narrativeState.activeProgramId) {
      // Continue existing narrative
      this.log(`Continuing narrative for NPC ${npcId}: ${narrativeState.activeProgramId}`);
      return true; // Allow interaction to proceed
    }

    // Resolve which program to start
    const programId = this.resolver.resolve(context);
    if (!programId) {
      this.log(`No narrative program for interaction: ${interactionId}`);
      return true; // Allow regular interaction handling
    }

    // Check if program can start
    if (this.resolver.canStart && !this.resolver.canStart(programId, context)) {
      this.log(`Program ${programId} cannot start in current context`);
      return true;
    }

    this.log(`Starting narrative program: ${programId} for NPC ${npcId}`);
    return true; // Allow interaction to proceed
  }

  /**
   * Called after an interaction is applied.
   * Executes narrative step if applicable.
   */
  async afterInteraction(
    intent: InteractionIntent,
    response: ExecuteInteractionResponse,
    session: GameSessionDTO
  ): Promise<void> {
    if (!response.success) return;

    const { npcId, interactionId } = intent;

    // npcId is required for narrative interactions
    if (npcId === undefined) {
      this.log(`No npcId for interaction: ${interactionId}`);
      return;
    }

    // Get narrative state
    const narrativeState = getNarrativeState(session, npcId);
    const relationship = this.runtime?.getNpcRelationship(npcId) ?? null;

    // Build resolution context
    const context: ProgramResolutionContext = {
      interactionId,
      npcId,
      session,
      relationship,
      narrativeState,
      intentContext: intent.context,
      locationId: intent.locationId,
      hotspotId: intent.hotspotId,
    };

    // If there's an active narrative, step through it
    if (narrativeState.activeProgramId) {
      await this.stepNarrative(session, npcId, this.buildStepInput(intent));
      return;
    }

    // Otherwise, try to start a new narrative
    const programId = this.resolver.resolve(context);
    if (programId) {
      await this.startNarrative(session, npcId, programId);
    }
  }

  /**
   * Called when a relationship changes.
   * May trigger relationship milestone narratives.
   */
  onRelationshipChanged(
    npcId: number,
    oldState: NpcRelationshipState | null,
    newState: NpcRelationshipState
  ): void {
    // Check for tier changes that might trigger narratives
    if (oldState?.tierId !== newState.tierId) {
      this.log(`Tier changed for NPC ${npcId}: ${oldState?.tierId} → ${newState.tierId}`);
      // Could trigger milestone narrative here
    }
  }

  // ===========================================================================
  // Public Narrative Control Methods
  // ===========================================================================

  /**
   * Start a narrative program for an NPC.
   */
  async startNarrative(
    session: GameSessionDTO,
    npcId: number,
    programId: string,
    initialVariables?: Record<string, any>
  ): Promise<ExecutorStepResult> {
    // Extract variables from session
    const sessionVariables = this.adapter.extractVariables(session, npcId);
    const variables = { ...sessionVariables, ...initialVariables };

    // Start the narrative
    const result = await this.executor.startAsync(session, npcId, programId, variables);

    // Update tracking
    this.activeNarratives.set(npcId, {
      programId,
      awaitingInput: result.awaitingInput,
    });

    // Persist state
    const persistedSession = this.adapter.persistNarrativeState(result.session, result.state, npcId);

    // Update runtime session if attached
    if (this.runtime) {
      await this.runtime.updateSession(persistedSession);
    }

    // Emit events
    this.emit('narrativeStarted', { npcId, programId, session: persistedSession });

    if (result.awaitingInput) {
      this.emit('awaitingInput', {
        npcId,
        programId,
        choices: result.choices,
        display: result.display,
      });
    }

    if (result.sceneTransition) {
      this.emit('sceneTransition', {
        npcId,
        programId,
        sceneId: String(result.sceneTransition.sceneId),
        transition: result.sceneTransition,
      });
    }

    if (result.finished) {
      this.activeNarratives.delete(npcId);
      this.emit('narrativeFinished', {
        npcId,
        programId,
        session: persistedSession,
        reason: result.error ? 'error' : 'completed',
      });
    }

    return {
      ...result,
      session: persistedSession,
    };
  }

  /**
   * Step through an active narrative.
   */
  async stepNarrative(
    session: GameSessionDTO,
    npcId: number,
    input?: StepInput
  ): Promise<ExecutorStepResult> {
    const active = this.activeNarratives.get(npcId);
    if (!active) {
      return {
        session,
        state: getNarrativeState(session, npcId),
        finished: true,
        awaitingInput: false,
        error: 'No active narrative for NPC',
      };
    }

    // Step the narrative
    const result = await this.executor.stepAsync(session, npcId, input);

    // Update tracking
    this.activeNarratives.set(npcId, {
      programId: active.programId,
      awaitingInput: result.awaitingInput,
    });

    // Persist state
    const persistedSession = this.adapter.persistNarrativeState(result.session, result.state, npcId);

    // Update runtime session if attached
    if (this.runtime) {
      await this.runtime.updateSession(persistedSession);
    }

    // Emit events
    this.emit('narrativeStep', {
      npcId,
      programId: active.programId,
      result: { ...result, session: persistedSession },
    });

    if (result.awaitingInput) {
      this.emit('awaitingInput', {
        npcId,
        programId: active.programId,
        choices: result.choices,
        display: result.display,
      });
    }

    if (result.sceneTransition) {
      this.emit('sceneTransition', {
        npcId,
        programId: active.programId,
        sceneId: String(result.sceneTransition.sceneId),
        transition: result.sceneTransition,
      });
    }

    if (result.finished) {
      this.activeNarratives.delete(npcId);
      this.emit('narrativeFinished', {
        npcId,
        programId: active.programId,
        session: persistedSession,
        reason: result.error ? 'error' : 'completed',
      });
    }

    return {
      ...result,
      session: persistedSession,
    };
  }

  /**
   * Cancel an active narrative.
   */
  async cancelNarrative(session: GameSessionDTO, npcId: number): Promise<GameSessionDTO> {
    const active = this.activeNarratives.get(npcId);
    if (!active) {
      return session;
    }

    // Clear narrative state
    const flags = { ...session.flags } as Record<string, any>;
    if (flags.narrative) {
      delete flags.narrative[`npc:${npcId}`];
    }

    // Also clear ECS state
    if (flags.ecs?.narrative) {
      delete flags.ecs.narrative[`npc:${npcId}`];
    }

    const updatedSession = {
      ...session,
      flags: flags as GameSessionDTO['flags'],
    };

    // Update runtime
    if (this.runtime) {
      await this.runtime.updateSession(updatedSession);
    }

    // Emit event
    this.emit('narrativeFinished', {
      npcId,
      programId: active.programId,
      session: updatedSession,
      reason: 'cancelled',
    });

    this.activeNarratives.delete(npcId);

    return updatedSession;
  }

  /**
   * Provide choice input for an awaiting narrative.
   */
  async selectChoice(
    session: GameSessionDTO,
    npcId: number,
    choiceId: string
  ): Promise<ExecutorStepResult> {
    return this.stepNarrative(session, npcId, { choiceId });
  }

  /**
   * Provide text input for an awaiting narrative.
   */
  async provideInput(
    session: GameSessionDTO,
    npcId: number,
    text: string
  ): Promise<ExecutorStepResult> {
    return this.stepNarrative(session, npcId, { text });
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  /**
   * Subscribe to narrative events.
   */
  on<K extends keyof NarrativeControllerEvents>(
    event: K,
    handler: (payload: NarrativeControllerEvents[K]) => void
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Unsubscribe from narrative events.
   */
  off<K extends keyof NarrativeControllerEvents>(
    event: K,
    handler: (payload: NarrativeControllerEvents[K]) => void
  ): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private buildStepInput(intent: InteractionIntent): StepInput | undefined {
    const context = intent.context as Record<string, unknown> | undefined;

    if (context?.choiceId && typeof context.choiceId === 'string') {
      return { choiceId: context.choiceId };
    }

    if (intent.playerInput) {
      return { text: intent.playerInput };
    }

    return undefined;
  }

  private emit<K extends keyof NarrativeControllerEvents>(
    event: K,
    payload: NarrativeControllerEvents[K]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[NarrativeController] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[NarrativeController] ${message}`);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a NarrativeController instance.
 */
export function createNarrativeController(
  config: NarrativeControllerConfig
): NarrativeController {
  return new NarrativeController(config);
}

/**
 * Create a narrative controller and attach it as a runtime plugin.
 */
export function setupNarrativeIntegration(
  runtime: GameRuntime,
  config: NarrativeControllerConfig
): NarrativeController {
  const controller = createNarrativeController(config);
  controller.attachRuntime(runtime);
  return controller;
}

// =============================================================================
// Interaction Response Builder
// =============================================================================

/**
 * Builds ExecuteInteractionResponse from narrative step result.
 * Used to format narrative output for the interaction API.
 */
export function buildNarrativeResponse(
  result: ExecutorStepResult,
  baseResponse?: Partial<ExecuteInteractionResponse>
): ExecuteInteractionResponse {
  // Extract text from display data if available
  const displayText = result.display?.data?.text as string | undefined;

  return {
    success: !result.error,
    message: result.error || displayText || 'Narrative step completed',
    timestamp: Date.now(),
    updatedSession: result.session,
    ...baseResponse,
  };
}
