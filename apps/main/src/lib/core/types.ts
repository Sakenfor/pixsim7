/**
 * Core type definitions for the headless @pixsim7/game.engine
 * These types define the contract between the core and any frontend (React/CLI/Discord/etc)
 *
 * Brain types come from shared types; runtime helpers from shared logic-core
 * so frontend and backend use the same data-driven BrainState model.
 */

import type { StatSource } from '@pixsim7/game.engine';
import type { BrainState } from '@shared/types';

export type {
  BrainState,
  BrainStatSnapshot,
  BrainMemory,
  DerivedBehaviorUrgency,
  BehaviorUrge,
} from '@shared/types';

export {
  hasStat,
  hasDerived,
  getDerived,
  getAxisValue,
  getMood,
  getBehaviorUrgency,
  getTopBehaviorUrges,
  hasBehaviorUrgency,
  getConversationStyle,
  getLogicStrategies,
  getInstincts,
  getMemories,
  getPersonaTags,
  getIntimacyLevel,
  getRelationshipFlags,
} from '@pixsim7/core.brain';

// ============================================================================
// Event System
// ============================================================================

export type CoreEventMap = {
  sessionLoaded: { session: GameSession };
  sessionUpdated: { session: GameSession };
  relationshipChanged: {
    npcId: number;
    relationship: NpcRelationshipState;
  };
  npcBrainChanged: {
    npcId: number;
    brain: BrainState;
  };
};

// ============================================================================
// Injectable Dependencies
// ============================================================================

export interface ApiClient {
  fetchSession(sessionId: number): Promise<GameSession>;
  saveSession(session: GameSession): Promise<void>;
  // Add other API methods as needed
}

export interface StorageProvider {
  loadLocalSession(sessionId: number): Promise<GameSession | null>;
  saveLocalSession(session: GameSession): Promise<void>;
}

export interface AuthProvider {
  getAccessToken(): Promise<string | null>;
}

// ============================================================================
// Game Session & State
// ============================================================================

export interface GameSession {
  id: number;
  world_id: number;
  player_character_id?: number;
  current_location_id?: number;
  flags: Record<string, any>;
  stats: {
    relationships?: Record<string, NpcRelationshipState>; // Key: "npc:ID"
    [statDefId: string]: Record<string, any> | undefined;
  };
  created_at: string;
  updated_at: string;
}

export interface GameNPC {
  id: number;
  world_id: number;
  name: string;
  personality?: {
    traits?: Record<string, number>; // e.g., openness: 0.7, boldness: 0.5
    tags?: string[]; // e.g., ["teasing", "confident"]
    conversation_style?: string;
  };
  // ... other NPC fields
}

// ============================================================================
// Relationship System
// ============================================================================

export interface NpcRelationshipState {
  affinity: number; // 0-100
  trust: number; // 0-100
  chemistry: number; // 0-100
  tension: number; // 0-100
  flags: string[]; // e.g., ["saved_from_accident", "first_kiss"]
  tierId?: string; // e.g., "friend", "close_friend", "lover"
  levelId?: string | null; // e.g., "light_flirt", "intimate"
  /**
   * True if tierId / levelId were computed by the backend and
   * stored in GameSession.relationships, false if they were derived
   * locally as a fallback.
   */
  isNormalized?: boolean;
  raw?: Record<string, any>; // Extra per-world axes
}

// ============================================================================
// NPC Brain System
// ============================================================================

// BrainState is now data-driven and imported from @pixsim7/shared.types
// See BrainState, BrainStatSnapshot, getMood, getAxisValue, etc.
// Old NpcBrainState with hardcoded fields has been removed.

// ============================================================================
// Core Interface
// ============================================================================

/**
 * Main headless game core interface
 * Frontends consume this to interact with game state
 */
export interface PixSim7Core {
  // ===== Lifecycle =====
  loadSession(sessionId: number): Promise<void>;
  getSession(): GameSession | null;

  // ===== Generic Stat Access =====
  /**
   * Get stat data using the stat adapter registry.
   * @example const rel = core.getStat('session.relationships', npcId) as NpcRelationshipState | null;
   */
  getStat(source: StatSource, entityId?: number): unknown | null;

  /**
   * Update stat data using the stat adapter registry.
   * @example core.updateStat('session.relationships', npcId, { values: { affinity: 50 } });
   */
  updateStat(source: StatSource, entityId: number | undefined, patch: unknown): void;

  // ===== NPC Brain Projection (data-driven BrainState) =====
  getNpcBrainState(npcId: number): BrainState | null;
  applyNpcBrainEdit(npcId: number, edit: Partial<BrainState>): void;

  // ===== Event System =====
  on<K extends keyof CoreEventMap>(
    event: K,
    handler: (payload: CoreEventMap[K]) => void
  ): () => void; // Returns unsubscribe function

  emit<K extends keyof CoreEventMap>(
    event: K,
    payload: CoreEventMap[K]
  ): void;
}

// ============================================================================
// Helper Types
// ============================================================================

export type RelationshipTier =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'lover';

export type IntimacyLevel =
  | 'light_flirt'
  | 'deep_flirt'
  | 'intimate'
  | 'very_intimate'
  | null;
