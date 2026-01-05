import type {
  GameSessionDTO,
  RelationshipTierId,
  IntimacyLevelId,
  BrainState,
  RelationshipValues,
  WorldStatsConfig,
} from '@pixsim7/shared.types';

/**
 * NPC persona type for personality and brain state integration.
 * This is the data structure fetched via NpcPersonaProvider.
 */
export interface NpcPersona {
  /** Personality trait modifiers (0-100 scale) */
  traits?: Record<string, number>;
  /** Base mood/disposition */
  baseMood?: string;
  /** Communication style preferences */
  communicationStyle?: Record<string, any>;
  /** Additional persona metadata */
  meta?: Record<string, any>;
}

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
    brain: BrainState;
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
 * - PixSim7Core will merge this with session overrides from flags.npcs when
 *   building the data-driven BrainState projection
 * - Session overrides always take precedence over base persona
 * - No new database columns needed; all data comes from existing JSON fields
 */
export interface NpcPersonaProvider {
  getNpcPersona(npcId: number): Promise<NpcPersona | null>;
}

/**
 * Stat configuration provider interface
 *
 * Allows injecting world-specific stats configuration into PixSim7Core.
 * This enables fully dynamic stat handling without hardcoding axis names.
 *
 * **Usage Pattern:**
 *
 * Wire from worldConfigStore in apps/main:
 * ```ts
 * const core = createPixSim7Core({
 *   statConfigProvider: {
 *     getStatsConfig: () => worldConfigStore.getState().statsConfig
 *   }
 * });
 * ```
 *
 * **Implementation Notes:**
 *
 * - Returns a snapshot of WorldStatsConfig
 * - Engine iterates over definitions dynamically instead of hardcoding stat names
 * - If not provided, falls back to safe empty config (relationships-only default)
 */
export interface StatConfigProvider {
  getStatsConfig(): WorldStatsConfig;
}

/**
 * NPC relationship state projection
 */
export interface NpcRelationshipState {
  /** Axis values - known keys optional, extensible for custom axes */
  values: RelationshipValues;
  /** Per-axis tier IDs computed by backend (e.g., { affinity: "friend", trust: "trusted" }) */
  tiers: Record<string, string>;
  /** Relationship flags (e.g., "first_kiss", "saved_from_accident") */
  flags: string[];
  /** Computed overall tier from backend - legacy, prefer using tiers */
  tierId?: RelationshipTierId;
  /** Computed intimacy level from backend (e.g., "intimate", "light_flirt") */
  intimacyLevelId?: IntimacyLevelId | null;
  /**
   * True if tierId / intimacyLevelId were computed by the backend
   * and stored in GameSession.relationships, false if they were
   * derived locally as a fallback.
   */
  isNormalized?: boolean;
  /** Raw data for debugging */
  raw?: Record<string, any>;
}

/**
 * Configuration for PixSim7Core
 */
export interface PixSim7CoreConfig {
  apiClient?: ApiClient;
  storageProvider?: StorageProvider;
  authProvider?: AuthProvider;
  npcPersonaProvider?: NpcPersonaProvider;
  statConfigProvider?: StatConfigProvider;
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

  // npc brain projection (data-driven BrainState)
  getNpcBrainState(npcId: number): BrainState | null;
  applyNpcBrainEdit(
    npcId: number,
    edit: Partial<BrainState>
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
