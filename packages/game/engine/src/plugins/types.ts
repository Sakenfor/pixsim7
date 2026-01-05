/**
 * Game Plugin System Types
 *
 * Pure TypeScript types for the game plugin/hook system.
 * These types define the contract for plugins that hook into the game tick lifecycle.
 */

// ============================================
// Event Types
// ============================================

export type GameEventType = 'info' | 'warning' | 'success' | 'error';

export type GameEventCategory =
  | 'time'
  | 'npc'
  | 'relationship'
  | 'quest'
  | 'world'
  | 'location'
  | 'scene'
  | 'mechanic'
  | 'plugin'
  | 'lifecycle'
  | 'custom';

export interface GameEvent {
  id: string;
  timestamp: number;
  worldTime: number;
  type: GameEventType;
  category: GameEventCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Context Types
// ============================================

/**
 * Context passed to tick hooks during game time advancement
 */
export interface GameTickContext {
  /** Current world ID */
  worldId: number;
  /** Current world details (generic to avoid coupling to specific DTO) */
  world: {
    id: number;
    name: string;
    world_time: number;
    [key: string]: unknown;
  };
  /** World time in seconds (after advancement) */
  worldTimeSeconds: number;
  /** How many seconds were advanced */
  deltaSeconds: number;
  /** Current session (may be null) */
  session: {
    id: number;
    flags?: Record<string, unknown>;
    stats?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  /** Current location ID (if in a room) */
  locationId: number | null;
  /** Whether this is turn-based mode */
  isTurnBased: boolean;
  /** Current turn number (turn-based only) */
  turnNumber: number;
  /** Context origin: 'game' for Game2D, 'simulation' for SimulationPlayground */
  origin: 'game' | 'simulation';
  /** Additional context for simulation (selected NPCs, etc.) */
  simulationContext?: {
    selectedNpcIds: number[];
  };
}

export interface SessionLoadedContext {
  worldId: number;
  sessionId: number;
  session: Record<string, unknown>;
  world: Record<string, unknown>;
  isNew: boolean;
}

export interface LocationEnteredContext {
  worldId: number;
  sessionId: number;
  locationId: number;
  previousLocationId: number | null;
  worldTimeSeconds: number;
}

export interface SceneContext {
  worldId: number;
  sessionId: number;
  sceneId: number;
  npcId?: number;
  worldTimeSeconds: number;
}

// ============================================
// Hook Types
// ============================================

export type BeforeTickHook = (context: GameTickContext) => Promise<void> | void;
export type OnTickHook = (context: GameTickContext) => Promise<GameEvent[]> | GameEvent[];
export type AfterTickHook = (context: GameTickContext, events: GameEvent[]) => Promise<void> | void;

export type SessionLoadedHook = (context: SessionLoadedContext) => Promise<GameEvent[]> | GameEvent[];
export type LocationEnteredHook = (context: LocationEnteredContext) => Promise<GameEvent[]> | GameEvent[];
export type SceneStartedHook = (context: SceneContext) => Promise<GameEvent[]> | GameEvent[];
export type SceneEndedHook = (context: SceneContext) => Promise<GameEvent[]> | GameEvent[];

// ============================================
// Plugin Interface
// ============================================

export interface GamePluginHooks {
  beforeTick?: BeforeTickHook;
  onTick?: OnTickHook;
  afterTick?: AfterTickHook;
  onSessionLoaded?: SessionLoadedHook;
  onLocationEntered?: LocationEnteredHook;
  onSceneStarted?: SceneStartedHook;
  onSceneEnded?: SceneEndedHook;
}

export interface GamePlugin {
  /** Unique plugin ID */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this plugin does */
  description?: string;
  /** Plugin version */
  version?: string;
  /** Author */
  author?: string;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Which contexts this plugin runs in ('game', 'simulation', or 'both') */
  runIn?: 'game' | 'simulation' | 'both';
  /** Plugin hooks */
  hooks: GamePluginHooks;
}

// ============================================
// Registry Interface
// ============================================

export interface IPluginRegistry {
  registerPlugin(plugin: GamePlugin): void;
  unregisterPlugin(id: string): void;
  getPlugins(): GamePlugin[];
  getPlugin(id: string): GamePlugin | undefined;
  setPluginEnabled(id: string, enabled: boolean): void;

  // Tick lifecycle
  runBeforeTick(context: GameTickContext): Promise<void>;
  runOnTick(context: GameTickContext): Promise<GameEvent[]>;
  runAfterTick(context: GameTickContext, events: GameEvent[]): Promise<void>;

  // Session/location lifecycle
  runSessionLoaded(context: SessionLoadedContext): Promise<GameEvent[]>;
  runLocationEntered(context: LocationEnteredContext): Promise<GameEvent[]>;
  runSceneStarted(context: SceneContext): Promise<GameEvent[]>;
  runSceneEnded(context: SceneContext): Promise<GameEvent[]>;

  // Event subscription
  onEvent(callback: (event: GameEvent) => void): () => void;
  onEventCategory(category: GameEventCategory, callback: (event: GameEvent) => void): () => void;
}
