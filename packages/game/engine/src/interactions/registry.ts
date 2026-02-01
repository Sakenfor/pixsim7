/**
 * Interaction Plugin Registry
 *
 * Core types and registry for the interaction plugin system.
 * Provides a flexible, extensible architecture for game interactions.
 *
 * Extracted from apps/main/src/lib/game/interactions/types.ts
 */

import type {
  GameSessionDTO,
  SessionUpdatePayload,
  NpcPresenceDTO,
  SensualTouchRequest,
  SensualTouchResponse,
} from '@pixsim7/shared.types';

import type {
  NpcSlotAssignment,
  InventoryItem,
  StatSource,
} from '../index';

/**
 * Base config interface all interaction plugins extend
 */
export interface BaseInteractionConfig {
  enabled: boolean;
  __presetId?: string;
  __presetName?: string;
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
 * Plugins can use this instead of importing from @pixsim7/game.engine
 *
 * Uses generic getStat/updateStat for extensibility - new stat packs
 * just register an adapter, no interface changes needed.
 *
 * Methods that modify state use optimistic updates:
 * 1. Apply change immediately (instant UI feedback)
 * 2. Send to backend for validation
 * 3. Apply server truth or rollback on error
 */
export interface SessionHelpers {
  /**
   * Generic stat read - works with any registered stat adapter.
   *
   * @param source - Stat source type (e.g., 'session.relationships', 'session.stats')
   * @param entityId - Optional entity ID (e.g., npcId for relationships)
   * @returns Stat data or null if not found. Cast to expected type.
   *
   * @example
   * const rel = session.getStat('session.relationships', npcId) as NpcRelationshipState | null;
   */
  getStat: (source: StatSource, entityId?: number) => unknown | null;

  /**
   * Generic stat update - works with any registered stat adapter.
   * New stat packs only need to register an adapter; no changes here.
   *
   * @param source - Stat source type (e.g., 'session.relationships', 'session.stats')
   * @param entityId - Optional entity ID (e.g., npcId for relationships)
   * @param patch - Partial data to merge (shape depends on adapter)
   *
   * @example
   * await session.updateStat('session.relationships', npcId, { values: { affinity: 50 } });
   */
  updateStat: (
    source: StatSource,
    entityId: number | undefined,
    patch: unknown
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
    status: 'pending' | 'active' | 'completed' | 'failed' | 'not_started' | 'in_progress'
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
 * Uses SessionUpdatePayload for type safety (prevents updating readonly fields)
 */
export interface SessionAPI {
  updateSession: (
    sessionId: number,
    updates: SessionUpdatePayload
  ) => Promise<SessionUpdateResponse>;
}

/**
 * Typed API client for plugins (NO imports needed in plugins!)
 */
export interface InteractionAPI {
  getSession: (id: number) => Promise<GameSessionDTO>;
  updateSession: (id: number, updates: Partial<GameSessionDTO>) => Promise<GameSessionDTO>;
  attemptPickpocket: (req: PickpocketRequest) => Promise<PickpocketResult>;
  attemptSensualTouch: (req: SensualTouchRequest) => Promise<SensualTouchResponse>;
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
 * Configuration field definition for plugin settings (extended)
 */
export interface ConfigField extends FormField {
  /** Default value */
  default?: any;
}

/**
 * Plugin configuration schema
 */
export interface ConfigSchema {
  [key: string]: ConfigField;
}

/**
 * UI behavior modes for interactions
 */
export type InteractionUIMode =
  | 'dialogue'      // Opens dialogue UI
  | 'notification'  // Shows notification only
  | 'silent'        // No UI feedback
  | 'custom'        // Plugin handles its own UI
  | 'minigame';     // Launches a minigame UI

/**
 * Interaction capabilities/effects for UI hints
 */
export interface InteractionCapabilities {
  /** Opens dialogue interface */
  opensDialogue?: boolean;

  /** Modifies inventory */
  modifiesInventory?: boolean;

  /** Affects relationship values */
  affectsRelationship?: boolean;

  /** Triggers game events */
  triggersEvents?: boolean;

  /** Has success/failure states */
  hasRisk?: boolean;

  /** Requires items */
  requiresItems?: boolean;

  /** Consumes items */
  consumesItems?: boolean;

  /** Can be detected (stealth) */
  canBeDetected?: boolean;

  /** Requires explicit player consent */
  requiresConsent?: boolean;

  /** Interaction can be unlocked via progression */
  unlockable?: boolean;
}

/**
 * Core plugin interface with enhanced metadata
 */
export interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string; // Unique ID (e.g., 'pickpocket')
  name: string; // Display name
  description: string; // Short description
  icon?: string; // Emoji or icon

  /** Category for organization/filtering */
  category?: string;

  /** Version string (semver recommended) */
  version?: string;

  /** Tags for filtering/searching */
  tags?: string[];

  /** Mark as experimental/beta */
  experimental?: boolean;

  /** UI behavior mode (how the 2D UI should respond) */
  uiMode?: InteractionUIMode;

  /** Capabilities/effects for UI hints */
  capabilities?: InteractionCapabilities;

  /** Lazy loading support for large plugins */
  loader?: () => Promise<InteractionPlugin<TConfig>>;

  /** Priority for preload when lazy loaded */
  preloadPriority?: number;

  defaultConfig: TConfig; // Default values when enabled
  configFields: FormField[]; // Auto-generates UI forms

  /** Optional configuration schema (can be derived from configFields) */
  configSchema?: ConfigSchema;

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
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
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
export interface InteractionRegistryOptions {
  duplicatePolicy?: 'warn' | 'error';
}

export class InteractionRegistry {
  private plugins = new Map<string, InteractionPlugin<any>>();
  private categoryIndex = new Map<string, Set<string>>();
  private cache = new LRUCache<string, InteractionPlugin<any>>(50);
  private loadingPromises = new Map<string, Promise<InteractionPlugin<any>>>();
  private preloadedIds = new Set<string>();
  private duplicatePolicy: 'warn' | 'error';

  constructor(options: InteractionRegistryOptions = {}) {
    this.duplicatePolicy = options.duplicatePolicy ?? 'warn';
  }

  register<TConfig extends BaseInteractionConfig>(plugin: InteractionPlugin<TConfig>) {
    // Validate required fields
    if (!plugin.id || plugin.id.trim().length === 0) {
      throw new Error('Interaction plugin must have a non-empty id');
    }
    if (!plugin.name || plugin.name.trim().length === 0) {
      throw new Error(`Interaction plugin "${plugin.id}" must have a non-empty name`);
    }
    if (typeof plugin.execute !== 'function') {
      throw new Error(`Interaction plugin "${plugin.id}" must have an execute function`);
    }

    // Warn if metadata is missing (not an error, just helpful)
    if (!plugin.description) {
      console.warn(`Interaction plugin "${plugin.id}" has no description`);
    }
    if (!plugin.category) {
      console.debug(`Interaction plugin "${plugin.id}" has no category`);
    }

    if (this.plugins.has(plugin.id)) {
      const message = `Interaction plugin "${plugin.id}" already registered`;
      if (this.duplicatePolicy === 'error') {
        throw new Error(message);
      }
      console.warn(`${message}, overwriting`);
      this.removeFromCategoryIndex(plugin.id);
      this.preloadedIds.delete(plugin.id);
      this.loadingPromises.delete(plugin.id);
    }

    this.plugins.set(plugin.id, plugin);

    if (plugin.category) {
      if (!this.categoryIndex.has(plugin.category)) {
        this.categoryIndex.set(plugin.category, new Set());
      }
      this.categoryIndex.get(plugin.category)!.add(plugin.id);
    }

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
    if (!plugin) {
      return undefined;
    }

    if (!plugin.loader || this.preloadedIds.has(id)) {
      this.cache.set(id, plugin);
    }
    return plugin;
  }

  /** Get plugin asynchronously, loading lazy plugins on demand */
  async getAsync(id: string): Promise<InteractionPlugin<any> | undefined> {
    const cached = this.cache.get(id);
    if (cached && (!cached.loader || this.preloadedIds.has(id))) {
      return cached;
    }

    const plugin = this.plugins.get(id);
    if (!plugin) {
      return undefined;
    }

    if (plugin.loader && !this.preloadedIds.has(id)) {
      return this.loadPlugin(id);
    }

    this.cache.set(id, plugin);
    return plugin;
  }

  /** Get all registered plugins */
  getAll(): InteractionPlugin<any>[] {
    return Array.from(this.plugins.values());
  }

  /** Get plugins by category (indexed) */
  getByCategory(category: string): InteractionPlugin<any>[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map(id => this.plugins.get(id))
      .filter((plugin): plugin is InteractionPlugin<any> => plugin !== undefined);
  }

  /** Check if plugin exists */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** Remove a plugin and clear indexes */
  unregister(id: string): boolean {
    if (!this.plugins.has(id)) {
      return false;
    }

    this.plugins.delete(id);
    this.removeFromCategoryIndex(id);
    this.cache.clear();
    this.preloadedIds.delete(id);
    this.loadingPromises.delete(id);
    return true;
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

  /** Preload lazy plugins by priority or IDs */
  async preload(ids?: string[]): Promise<void> {
    const toPreload = ids || this.getPreloadCandidates();

    await Promise.all(toPreload.map(id => this.loadPlugin(id)));
  }

  /** Get plugins that should be preloaded */
  private getPreloadCandidates(): string[] {
    const plugins = Array.from(this.plugins.values());
    return plugins
      .filter(p => p.loader && !this.preloadedIds.has(p.id))
      .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0))
      .map(p => p.id)
      .slice(0, 10);
  }

  /** Load a lazy plugin */
  private async loadPlugin(id: string): Promise<InteractionPlugin<any> | undefined> {
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id);
    }

    const plugin = this.plugins.get(id);
    if (!plugin || !plugin.loader) {
      return plugin;
    }

    const loadPromise = plugin.loader()
      .then(loadedPlugin => {
        this.plugins.set(id, loadedPlugin);
        this.cache.set(id, loadedPlugin);
        this.preloadedIds.add(id);
        this.loadingPromises.delete(id);
        return loadedPlugin;
      })
      .catch(error => {
        console.error(`Failed to load interaction plugin ${id}:`, error);
        this.loadingPromises.delete(id);
        return plugin;
      });

    this.loadingPromises.set(id, loadPromise);
    return loadPromise;
  }

  private removeFromCategoryIndex(id: string): void {
    for (const [category, ids] of this.categoryIndex.entries()) {
      if (ids.has(id)) {
        ids.delete(id);
        if (ids.size === 0) {
          this.categoryIndex.delete(category);
        }
      }
    }
  }
}

/**
 * Global registry instance
 */
export const interactionRegistry = new InteractionRegistry({ duplicatePolicy: 'error' });

/**
 * Execute an interaction by ID
 */
export async function executeInteraction(
  interactionId: string,
  config: BaseInteractionConfig,
  context: InteractionContext
): Promise<InteractionResult> {
  const plugin = await interactionRegistry.getAsync(interactionId);
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
