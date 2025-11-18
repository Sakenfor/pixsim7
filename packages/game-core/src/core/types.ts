import type { GameSessionDTO } from '@pixsim7/types';
import type { NpcPersona } from '../npcs/brain';

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

  'persona:loaded': {
    npcId: number;
    persona: NpcPersona;
  };

  'persona:invalidated': {
    npcId: number;
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
 * NPC persona provider interface
 *
 * Allows injecting NPC personality data (from GameNPC.personality or other sources)
 * into brain state computation.
 *
 * **Usage Pattern:**
 *
 * 1. Configure the provider when creating PixSim7Core:
 * ```ts
 * const core = createPixSim7Core({
 *   npcPersonaProvider: {
 *     async getNpcPersona(npcId) {
 *       const npc = await fetchNpcFromBackend(npcId);
 *       return npc.personality; // GameNPC.personality field
 *     }
 *   }
 * });
 * ```
 *
 * 2. Preload persona before building brain state:
 * ```ts
 * await core.preloadNpcPersona(npcId);
 * const brain = core.getNpcBrainState(npcId); // Uses preloaded persona
 * ```
 *
 * **Implementation Notes:**
 *
 * - The provider should return base persona data from GameNPC.personality
 * - buildNpcBrainState will merge this with session overrides from flags.npcs
 * - Session overrides always take precedence over base persona
 * - No new database columns needed; all data comes from existing JSON fields
 */
export interface NpcPersonaProvider {
  getNpcPersona(npcId: number): Promise<NpcPersona | null>;
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
  npcPersonaProvider?: NpcPersonaProvider;
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

  // npc persona management
  preloadNpcPersona(npcId: number): Promise<void>;
  getCachedPersona(npcId: number): any | undefined;
  invalidatePersona(npcId: number): void;

  // events
  on<K extends keyof CoreEventMap>(
    event: K,
    handler: (payload: CoreEventMap[K]) => void
  ): () => void;
}
