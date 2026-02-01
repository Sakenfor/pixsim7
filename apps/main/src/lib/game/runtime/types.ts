/**
 * Game Runtime Types
 *
 * Types for the unified game runtime abstraction that sits between
 * UI routes and the underlying GameRuntime from @pixsim7/game.engine.
 */

import type {
  GameMode,
  SessionFlags,
  WorldMode,
  PlayerActor,
  AnyActor,
  PlayerSlot,
} from '@lib/registries';

// Re-export WorldTimeDisplay from shared package
export type { WorldTimeDisplay } from '@pixsim7/game.engine';

/**
 * Runtime state snapshot - reactive state for React components
 */
export interface GameRuntimeState {
  /** Current world ID (null if no world loaded) */
  worldId: number | null;
  /** Current session ID (null if no session) */
  sessionId: number | null;
  /** World time in seconds */
  worldTimeSeconds: number;
  /** Current location ID (null if not in a room) */
  locationId: number | null;
  /** Current game mode (from gameStateStore) */
  mode: GameMode | null;
  /** Whether the world is in turn-based mode */
  isTurnBased: boolean;
  /** Current turn number (turn-based mode only) */
  turnNumber: number;
}

/**
 * Options for session creation/initialization
 */
export interface GameRuntimeOptions {
  /**
   * Session kind: 'world' for life-sim, 'scene' for single-scene, 'simulation' for playground
   * @default 'world'
   */
  sessionKind?: 'world' | 'scene' | 'simulation';
  /**
   * World mode: 'turn_based' or 'real_time'
   * @default from world configuration
   */
  worldMode?: WorldMode;
  /**
   * Turn delta in seconds for turn-based mode
   * @default from world configuration or 3600 (1 hour)
   */
  turnDeltaSeconds?: number;
  /**
   * Initial location ID
   */
  initialLocationId?: number;
  /**
   * Initial session flags (merged with defaults)
   */
  initialFlags?: Partial<SessionFlags>;
}

// WorldTimeDisplay is now exported from @pixsim7/game.engine (re-exported above)

// ===================
// Actor Runtime Types
// ===================

/**
 * Local player state - the player actor controlled by this client
 *
 * In single-player, there's one local player.
 * In multiplayer, each client has one local player but sees other remote players.
 */
export interface LocalPlayerState {
  /** The player actor */
  actor: PlayerActor;
  /** Whether this is the primary/host player */
  isHost: boolean;
}

/**
 * Actor runtime state - tracks all actors in the current world
 *
 * This is a subset of world state focused on actors that the runtime
 * needs to track for gameplay purposes.
 */
export interface ActorRuntimeState {
  /** Local player actor (null in simulation/spectator mode) */
  localPlayer: LocalPlayerState | null;
  /** All player slots in the world (for multiplayer) */
  playerSlots: PlayerSlot[];
  /** Actors currently visible/relevant (NPCs at current location, etc.) */
  visibleActors: AnyActor[];
}

/**
 * Options for player actor creation
 */
export interface CreatePlayerOptions {
  /** Player name */
  name: string;
  /** Initial location ID */
  locationId?: number;
  /** Initial stats */
  stats?: Record<string, number>;
  /** Initial inventory */
  inventory?: Array<{ itemId: string; quantity: number }>;
  /** Initial flags */
  flags?: Record<string, unknown>;
}
