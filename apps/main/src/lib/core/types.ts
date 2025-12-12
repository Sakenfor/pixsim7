/**
 * Core type definitions for the headless@pixsim7/game.engine
 * These types define the contract between the core and any frontend (React/CLI/Discord/etc)
 *
 * Note: BrainState is now imported from @pixsim7/shared.types
 */

import type { BrainState } from '@/lib/core/types';

// Re-export BrainState for convenience
export type { BrainState } from '@/lib/core/types';

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
  intimacyLevelId?: string | null; // e.g., "light_flirt", "intimate"
  /**
   * True if tierId / intimacyLevelId were computed by the backend and
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

  // ===== Relationships =====
  getNpcRelationship(npcId: number): NpcRelationshipState | null;
  updateNpcRelationship(
    npcId: number,
    patch: Partial<NpcRelationshipState>
  ): void;

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

// ============================================================================
// BrainState Helper Functions
// ============================================================================

/**
 * Helper functions to extract values from BrainState
 */
export const hasStat = (brain: any, statKey: string): boolean => {
  return statKey in (brain.stats || {});
};

export const hasDerived = (brain: any, key: string): boolean => {
  return key in (brain.derived || {});
};

export const getDerived = <T = unknown>(brain: any, key: string): T | undefined => {
  return brain.derived?.[key] as T;
};

export const getAxisValue = (brain: any, statKey: string, axisKey: string): number | undefined => {
  return brain.stats?.[statKey]?.axes?.[axisKey] as number;
};

export const getMood = (brain: any): { valence: number; arousal: number; label: string } | null => {
  return getDerived(brain, 'mood') || null;
};

export const getConversationStyle = (brain: any): string | null => {
  return getDerived(brain, 'conversation_style') || null;
};

export const getPersonaTags = (brain: any): string[] => {
  return getDerived<string[]>(brain, 'persona_tags') || [];
};

export const getIntimacyLevel = (brain: any): string | null => {
  return getDerived(brain, 'intimacy_level') || null;
};

export const getLogicStrategies = (brain: any): string[] => {
  return getDerived<string[]>(brain, 'logic_strategies') || [];
};

export const getInstincts = (brain: any): string[] => {
  return getDerived<string[]>(brain, 'instincts') || [];
};

export const getMemories = (brain: any): unknown[] => {
  return getDerived<unknown[]>(brain, 'memories') || [];
};

export type BrainMemory = unknown;
