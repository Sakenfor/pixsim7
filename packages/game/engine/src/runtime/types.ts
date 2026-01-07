/**
 * GameRuntime and GameController types
 *
 * This module defines the interfaces for the runtime/controller layer that sits
 * between session/state APIs and UI surfaces. The runtime centralizes game session
 * orchestration (loading/saving, applying interactions, advancing world time, emitting events).
 */

import type {
  GameSessionDTO,
  GameWorldDetail,
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  ListInteractionsRequest,
  ListInteractionsResponse,
  ResolveTemplateResponse,
  ResolveBatchResponse,
  TemplateKind,
} from '@pixsim7/shared.types';
import type { NpcRelationshipState } from '../core/types';
import type { StatSource } from '../session/statAdapters';

// ===================
// API Client Interface
// ===================

/**
 * API client interface that wraps all backend game APIs
 */
export interface GameApiClient {
  // Session APIs
  fetchSession(sessionId: number): Promise<GameSessionDTO>;
  updateSession(
    sessionId: number,
    payload: Partial<GameSessionDTO>
  ): Promise<GameSessionDTO>;

  // World APIs
  getWorld(worldId: number): Promise<GameWorldDetail>;
  advanceWorldTime(worldId: number, deltaSeconds: number): Promise<GameWorldDetail>;

  // Interaction APIs
  listInteractions(req: ListInteractionsRequest): Promise<ListInteractionsResponse>;
  executeInteraction(req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse>;

  // NPC APIs
  getNpcDetail?(npcId: number): Promise<any>;

  // Template Resolution APIs (ObjectLink system)
  /**
   * Resolve a template entity to its linked runtime entity.
   * Uses the ObjectLink system with activation conditions based on context.
   */
  resolveTemplate?(
    templateKind: TemplateKind,
    templateId: string,
    context?: Record<string, unknown>
  ): Promise<ResolveTemplateResponse>;

  /**
   * Batch resolve multiple template references in one call.
   * More efficient than multiple single resolveTemplate calls.
   */
  resolveTemplateBatch?(
    refs: Array<{
      templateKind: TemplateKind;
      templateId: string;
      context?: Record<string, unknown>;
    }>,
    sharedContext?: Record<string, unknown>
  ): Promise<ResolveBatchResponse>;
}

/**
 * Storage provider for offline caching
 */
export interface SessionStorage {
  loadLocalSession(sessionId: number): Promise<GameSessionDTO | null>;
  saveLocalSession(session: GameSessionDTO): Promise<void>;
  clearLocalSession(sessionId: number): Promise<void>;
}

// ===================
// Plugin System
// ===================

/**
 * GameRuntimePlugin - extension point for gating, romance, behavior, etc.
 */
export interface GameRuntimePlugin {
  id: string;
  name: string;

  /**
   * Called when a session is loaded
   */
  onSessionLoaded?(session: GameSessionDTO): void | Promise<void>;

  /**
   * Called before an interaction is applied
   * Can modify the interaction request or cancel it by returning false
   */
  beforeInteraction?(
    intent: InteractionIntent,
    session: GameSessionDTO
  ): boolean | Promise<boolean>;

  /**
   * Called after an interaction is applied
   */
  afterInteraction?(
    intent: InteractionIntent,
    response: ExecuteInteractionResponse,
    session: GameSessionDTO
  ): void | Promise<void>;

  /**
   * Called when a relationship changes
   */
  onRelationshipChanged?(
    npcId: number,
    oldState: NpcRelationshipState | null,
    newState: NpcRelationshipState
  ): void | Promise<void>;
}

// ===================
// Runtime Configuration
// ===================

/**
 * Configuration for GameRuntime
 */
export interface GameRuntimeConfig {
  /** API client for backend communication */
  apiClient: GameApiClient;

  /** Optional storage provider for offline/local caching */
  storageProvider?: SessionStorage;

  /** Optional plugins for gating, romance, behavior extensions */
  plugins?: GameRuntimePlugin[];

  /** Enable debug logging */
  debug?: boolean;
}

// ===================
// Interaction Intents
// ===================

/**
 * InteractionIntent - encapsulates everything needed to execute an interaction
 *
 * Supports two targeting modes:
 * 1. Direct: Specify npcId directly (legacy, still supported)
 * 2. Template-based: Specify templateKind + templateId, resolved via ObjectLink
 *
 * Template-based targeting is preferred for authored content as it allows
 * the same content to work across different worlds/playthroughs.
 */
export interface InteractionIntent {
  /** Unique identifier for the interaction */
  interactionId: string;

  /**
   * NPC ID to interact with (direct targeting).
   * Optional if using template-based targeting.
   */
  npcId?: number;

  /**
   * Template entity kind for template-based targeting.
   * When set with templateId, the runtime will resolve to npcId via ObjectLink.
   */
  templateKind?: TemplateKind;

  /**
   * Template entity ID for template-based targeting.
   * Used with templateKind for ObjectLink resolution.
   */
  templateId?: string;

  /** World ID */
  worldId: number;

  /** Session ID */
  sessionId: number;

  /** Optional location ID */
  locationId?: number;

  /** Optional hotspot ID if triggered from a hotspot */
  hotspotId?: string;

  /** Optional player input (e.g., dialogue choice text) */
  playerInput?: string;

  /** Optional context data */
  context?: Record<string, unknown>;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ===================
// Runtime Events
// ===================

/**
 * Event emitted when a session is loaded
 */
export interface SessionLoadedEvent {
  session: GameSessionDTO;
  world: GameWorldDetail | null;
}

/**
 * Event emitted when a session is updated
 */
export interface SessionUpdatedEvent {
  session: GameSessionDTO;
  previousSession: GameSessionDTO;
  changes: SessionChanges;
}

/**
 * Describes what changed in a session update
 */
export interface SessionChanges {
  flags?: boolean;
  stats?: boolean;
  worldTime?: boolean;
  version?: boolean;
}

/**
 * Event emitted when an NPC relationship changes
 */
export interface NpcRelationshipChangedEvent {
  npcId: number;
  oldState: NpcRelationshipState | null;
  newState: NpcRelationshipState;
}

/**
 * Event emitted when world time advances
 */
export interface WorldTimeAdvancedEvent {
  worldId: number;
  previousTime: number;
  newTime: number;
  deltaSeconds: number;
}

/**
 * Event emitted when an interaction is executed
 */
export interface InteractionExecutedEvent {
  intent: InteractionIntent;
  response: ExecuteInteractionResponse;
  success: boolean;
}

/**
 * Event emitted when an error occurs
 */
export interface RuntimeErrorEvent {
  error: Error;
  context: string;
}

/**
 * Map of all runtime events
 */
export interface GameRuntimeEvents {
  sessionLoaded: SessionLoadedEvent;
  sessionUpdated: SessionUpdatedEvent;
  npcRelationshipChanged: NpcRelationshipChangedEvent;
  worldTimeAdvanced: WorldTimeAdvancedEvent;
  interactionExecuted: InteractionExecutedEvent;
  error: RuntimeErrorEvent;
}

// ===================
// GameRuntime Interface
// ===================

/**
 * GameRuntime - core runtime that owns client-side session/world state
 * and provides methods for loading, saving, and updating game state
 */
export interface GameRuntime {
  /**
   * Load a session (and optionally its world)
   */
  loadSession(sessionId: number, loadWorld?: boolean): Promise<void>;

  /**
   * Get the current session (read-only)
   */
  getSession(): Readonly<GameSessionDTO> | null;

  /**
   * Get the current world (read-only)
   */
  getWorld(): Readonly<GameWorldDetail> | null;

  /**
   * Apply an interaction to the current session
   */
  applyInteraction(intent: InteractionIntent): Promise<ExecuteInteractionResponse>;

  /**
   * Advance world time
   */
  advanceWorldTime(deltaSeconds: number): Promise<void>;

  /**
   * Get stat data using the stat adapter registry.
   */
  getStat(source: StatSource, entityId?: number): unknown | null;

  /**
   * Update session (manually)
   */
  updateSession(updates: Partial<GameSessionDTO>): Promise<void>;

  /**
   * Save session to backend (if changes are pending)
   */
  saveSession(): Promise<void>;

  /**
   * Subscribe to runtime events
   */
  on<K extends keyof GameRuntimeEvents>(
    event: K,
    handler: (payload: GameRuntimeEvents[K]) => void
  ): () => void;

  /**
   * Unsubscribe from runtime events
   */
  off<K extends keyof GameRuntimeEvents>(
    event: K,
    handler: (payload: GameRuntimeEvents[K]) => void
  ): void;

  /**
   * Dispose runtime and clean up resources
   */
  dispose(): void;
}

// ===================
// Input Intents (for GameController)
// ===================

/**
 * Input intent types that UI can send to the controller
 */
export type GameInputIntent =
  | {
      type: 'interact';
      interactionId: string;
      /** Direct NPC targeting (optional if using template-based) */
      npcId?: number;
      /** Template-based targeting (optional if using npcId) */
      templateKind?: TemplateKind;
      templateId?: string;
      hotspotId?: string;
      playerInput?: string;
      context?: Record<string, unknown>;
    }
  | {
      type: 'selectOption';
      interactionId: string;
      /** Direct NPC targeting (optional if using template-based) */
      npcId?: number;
      /** Template-based targeting (optional if using npcId) */
      templateKind?: TemplateKind;
      templateId?: string;
      choiceId: string;
      choiceText?: string;
    }
  | {
      type: 'advanceTime';
      deltaSeconds: number;
    }
  | {
      type: 'loadSession';
      sessionId: number;
      loadWorld?: boolean;
    }
  | {
      type: 'saveSession';
    };

// ===================
// GameController Interface
// ===================

/**
 * GameController - translates UI input into runtime actions
 * Provides a clean interface for UIs without exposing runtime internals
 */
export interface GameController {
  /**
   * Attach a runtime instance to this controller
   */
  attachRuntime(runtime: GameRuntime): void;

  /**
   * Detach the current runtime
   */
  detachRuntime(): void;

  /**
   * Get the attached runtime (read-only)
   */
  getRuntime(): GameRuntime | null;

  /**
   * Handle a user input intent
   */
  handleInput(intent: GameInputIntent): Promise<void>;

  /**
   * Check if controller is ready (has runtime attached)
   */
  isReady(): boolean;
}
