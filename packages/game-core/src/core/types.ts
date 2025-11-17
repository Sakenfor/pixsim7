import type { GameSessionDTO } from '@pixsim7/types';

/**
 * Core event map for the PixSim7Core event bus
 */
export type CoreEventMap = {
  sessionLoaded: { session: GameSessionDTO };
  sessionUpdated: { session: GameSessionDTO };

  relationshipChanged: {
    npcId: number;
    relationship: NpcRelationshipState;
  };

  npcBrainChanged: {
    npcId: number;
    brain: NpcBrainState;
  };
};

/**
 * API client interface for fetching and saving sessions
 */
export interface ApiClient {
  fetchSession(sessionId: number): Promise<GameSessionDTO>;
  saveSession(session: GameSessionDTO): Promise<void>;
}

/**
 * Storage provider interface for local session persistence
 */
export interface StorageProvider {
  loadLocalSession(sessionId: number): Promise<GameSessionDTO | null>;
  saveLocalSession(session: GameSessionDTO): Promise<void>;
}

/**
 * Authentication provider interface
 */
export interface AuthProvider {
  getAccessToken(): Promise<string | null>;
}

/**
 * NPC relationship state projection
 */
export interface NpcRelationshipState {
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
  flags: string[];
  tierId?: string;
  intimacyLevelId?: string | null;
  raw?: Record<string, any>;
}

/**
 * NPC memory entry
 */
export interface NpcMemory {
  id: string;
  timestamp: string;
  summary: string;
  tags: string[];
  source?: 'scene' | 'event' | 'flag';
}

/**
 * NPC brain state - combines personality, relationship state, and mood
 */
export interface NpcBrainState {
  traits: Record<string, number>;
  personaTags: string[];
  conversationStyle?: string;

  memories: NpcMemory[];

  mood: {
    valence: number;
    arousal: number;
    label?: string;
  };

  logic: {
    strategies: string[];
  };

  instincts: string[];

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

/**
 * Configuration for PixSim7Core
 */
export interface PixSim7CoreConfig {
  apiClient?: ApiClient;
  storageProvider?: StorageProvider;
  authProvider?: AuthProvider;
}

/**
 * Main interface for the PixSim7 headless game core
 */
export interface PixSim7Core {
  // lifecycle
  loadSession(sessionId: number): Promise<void>;
  getSession(): GameSessionDTO | null;

  // relationships
  getNpcRelationship(npcId: number): NpcRelationshipState | null;
  updateNpcRelationship(
    npcId: number,
    patch: Partial<NpcRelationshipState>
  ): void;

  // npc brain projection
  getNpcBrainState(npcId: number): NpcBrainState | null;
  applyNpcBrainEdit(
    npcId: number,
    edit: Partial<NpcBrainState>
  ): void;

  // events
  on<K extends keyof CoreEventMap>(
    event: K,
    handler: (payload: CoreEventMap[K]) => void
  ): () => void;
}
