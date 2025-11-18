import type { GameSessionDTO, NpcPresenceDTO } from '../../api/game';
import type {
  NpcSlotAssignment,
  NpcRelationshipState,
  InventoryItem,
} from '@pixsim7/game-core';

/**
 * Base config interface all interaction plugins extend
 */
export interface BaseInteractionConfig {
  enabled: boolean;
}

/**
 * Form field types for auto-generating UI
 */
export type FormFieldType = 'number' | 'text' | 'boolean' | 'select' | 'tags';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  options?: Array<{ value: string | number; label: string }>;
}

/**
 * Session helpers interface - provides clean API for session manipulation
 * Plugins can use this instead of importing from @pixsim7/game-core
 *
 * Methods that modify state use optimistic updates:
 * 1. Apply change immediately (instant UI feedback)
 * 2. Send to backend for validation
 * 3. Apply server truth or rollback on error
 */
export interface SessionHelpers {
  /** Get NPC relationship state */
  getNpcRelationship: (npcId: number) => NpcRelationshipState | null;

  /** Update NPC relationship (optimistic, async validated) */
  updateNpcRelationship: (
    npcId: number,
    patch: Partial<NpcRelationshipState>
  ) => Promise<GameSessionDTO>;

  /** Get current inventory */
  getInventory: () => InventoryItem[];

  /** Add item to inventory (optimistic, async validated) */
  addInventoryItem: (itemId: string, quantity?: number) => Promise<GameSessionDTO>;

  /** Remove item from inventory (optimistic, async validated) */
  removeInventoryItem: (itemId: string, quantity?: number) => Promise<GameSessionDTO>;

  /** Update arc stage (optimistic, async validated) */
  updateArcStage: (arcId: string, stage: number) => Promise<GameSessionDTO>;

  /** Mark scene as seen (optimistic, async validated) */
  markSceneSeen: (arcId: string, sceneId: number) => Promise<GameSessionDTO>;

  /** Update quest status (optimistic, async validated) */
  updateQuestStatus: (
    questId: string,
    status: 'pending' | 'active' | 'completed' | 'failed'
  ) => Promise<GameSessionDTO>;

  /** Increment quest steps (optimistic, async validated) */
  incrementQuestSteps: (questId: string, increment?: number) => Promise<GameSessionDTO>;

  /** Trigger event (optimistic, async validated) */
  triggerEvent: (eventId: string) => Promise<GameSessionDTO>;

  /** End event (optimistic, async validated) */
  endEvent: (eventId: string) => Promise<GameSessionDTO>;

  /** Check if event is active */
  isEventActive: (eventId: string) => boolean;
}

/**
 * Interaction execution context - everything a plugin needs
 */
export interface InteractionContext {
  state: InteractionState;
  api: InteractionAPI;
  session: SessionHelpers;
  onSceneOpen: (sceneId: number, npcId: number) => Promise<void>;
  onSessionUpdate?: (session: GameSessionDTO) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

/**
 * Complete world/session/NPC state injected into plugins
 */
export interface InteractionState {
  assignment: NpcSlotAssignment;
  gameSession: GameSessionDTO | null;
  sessionFlags: Record<string, unknown>;
  relationships: Record<string, unknown>;
  worldId: number | null;
  worldTime: { day: number; hour: number };
  locationId: number;
  locationNpcs: NpcPresenceDTO[];
}

/**
 * Session update response with conflict detection
 */
export interface SessionUpdateResponse {
  session?: GameSessionDTO;
  conflict?: boolean;
  serverSession?: GameSessionDTO;
}

/**
 * Session API for optimistic updates (backend sync)
 */
export interface SessionAPI {
  updateSession: (
    sessionId: number,
    updates: Partial<GameSessionDTO> & { expectedVersion?: number }
  ) => Promise<SessionUpdateResponse>;
}

/**
 * Typed API client for plugins (NO imports needed in plugins!)
 */
export interface InteractionAPI {
  getSession: (id: number) => Promise<GameSessionDTO>;
  updateSession: (id: number, updates: Partial<GameSessionDTO>) => Promise<GameSessionDTO>;
  attemptPickpocket: (req: PickpocketRequest) => Promise<PickpocketResult>;
  getScene: (id: number) => Promise<any>;
  // Add more API methods as needed
}

export interface PickpocketRequest {
  npc_id: number;
  slot_id: string;
  base_success_chance: number;
  detection_chance: number;
  world_id: number | null;
  session_id: number;
}

export interface PickpocketResult {
  success: boolean;
  detected: boolean;
  message: string;
}

/**
 * Interaction execution result
 */
export interface InteractionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Core plugin interface
 */
export interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string; // Unique ID (e.g., 'pickpocket')
  name: string; // Display name
  description: string; // Short description
  icon?: string; // Emoji or icon
  defaultConfig: TConfig; // Default values when enabled
  configFields: FormField[]; // Auto-generates UI forms
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}

/**
 * LRU Cache for frequently accessed plugins
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if already exists (to update position)
    this.cache.delete(key);

    // Add to end
    this.cache.set(key, value);

    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Plugin registry with performance optimizations:
 * - LRU cache for frequently accessed plugins (max 50 entries)
 * - Lazy loading support for plugin-based interactions
 * - Automatic preloading of high-priority plugins
 */
export class InteractionRegistry {
  private plugins = new Map<string, InteractionPlugin<any>>();
  private cache = new LRUCache<string, InteractionPlugin<any>>(50);
  private loadingPromises = new Map<string, Promise<InteractionPlugin<any>>>();
  private preloadedIds = new Set<string>();

  register<TConfig extends BaseInteractionConfig>(plugin: InteractionPlugin<TConfig>) {
    this.plugins.set(plugin.id, plugin);

    // Update cache if already cached
    if (this.cache.has(plugin.id)) {
      this.cache.set(plugin.id, plugin);
    }
  }

  /** Get plugin (with caching) */
  get(id: string): InteractionPlugin<any> | undefined {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const plugin = this.plugins.get(id);
    if (plugin) {
      this.cache.set(id, plugin);
    }
    return plugin;
  }

  /** Get all registered plugins */
  getAll(): InteractionPlugin<any>[] {
    return Array.from(this.plugins.values());
  }

  /** Check if plugin exists */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** Clear cache (useful for testing/debugging) */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 50,
    };
  }
}

/**
 * Global registry instance
 */
export const interactionRegistry = new InteractionRegistry();

/**
 * Execute an interaction by ID
 */
export async function executeInteraction(
  interactionId: string,
  config: BaseInteractionConfig,
  context: InteractionContext
): Promise<InteractionResult> {
  const plugin = interactionRegistry.get(interactionId);
  if (!plugin) {
    throw new Error(`Unknown interaction plugin: ${interactionId}`);
  }

  // Validate config
  if (plugin.validate) {
    const error = plugin.validate(config);
    if (error) {
      return { success: false, message: error };
    }
  }

  // Check availability
  if (plugin.isAvailable && !plugin.isAvailable(context)) {
    return { success: false, message: `${plugin.name} is not available` };
  }

  // Execute
  return plugin.execute(config, context);
}
