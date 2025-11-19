/**
 * Core type definitions for the headless @pixsim7/game-core
 * These types define the contract between the core and any frontend (React/CLI/Discord/etc)
 */

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
    brain: NpcBrainState;
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
  relationships: Record<string, NpcRelationshipState>; // Key: "npc:ID"
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
// NPC Brain System (Semantic View Model)
// ============================================================================

/**
 * NPC Brain State - A semantic projection of NPC data for the brain shape
 * This combines personality, relationships, and derived state into a unified view
 */
export interface NpcBrainState {
  // CORTEX: Personality & Traits
  traits: Record<string, number>; // e.g., { openness: 0.7, boldness: 0.5, kindness: 0.8 }
  personaTags: string[]; // e.g., ["teasing", "confident", "protective"]
  conversationStyle?: string; // e.g., "teasing", "soft", "formal"

  // MEMORY: Notable Past Interactions
  memories: NpcMemory[];

  // EMOTION: Current Mood
  mood: {
    valence: number; // -1 (negative) to 1 (positive)
    arousal: number; // 0 (calm) to 1 (excited)
    label?: string; // e.g., "content", "jealous", "excited"
  };

  // LOGIC: Decision-Making Strategies
  logic: {
    strategies: string[]; // e.g., ["cautious", "impulsive", "calculating"]
  };

  // INSTINCT: Base Drives & Archetypes
  instincts: string[]; // e.g., ["protective", "curious", "competitive"]

  // SOCIAL: Relationship Summary
  social: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
    tierId?: string;
    intimacyLevelId?: string | null;
    flags: string[];
  };
}

export interface NpcMemory {
  id: string;
  timestamp: string;
  summary: string;
  tags: string[]; // e.g., ["first_kiss", "conflict", "gift"]
  source?: 'scene' | 'event' | 'flag';
}

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

  // ===== NPC Brain Projection =====
  getNpcBrainState(npcId: number): NpcBrainState | null;
  applyNpcBrainEdit(npcId: number, edit: Partial<NpcBrainState>): void;

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
