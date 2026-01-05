import type { GameSessionDTO, BrainState, BrainStatSnapshot, WorldStatsConfig, StatDefinition } from '@pixsim7/shared.types';
import { WorldId, NpcId, DEFAULT_WORLD_STATS_CONFIG } from '@pixsim7/shared.types';
import type {
  PixSim7Core as IPixSim7Core,
  PixSim7CoreConfig,
  CoreEventMap,
  NpcRelationshipState,
  DerivedStatPreviewResult,
} from './types';
import {
  getNpcRelationshipState,
  setNpcRelationshipState,
} from '../session/state';

/**
 * Simple typed event emitter
 */
class TypedEventEmitter<TEventMap extends Record<string, any>> {
  private handlers: Map<keyof TEventMap, Set<(payload: any) => void>> = new Map();

  on<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }
  }
}

/**
 * PixSim7Core implementation
 *
 * Headless game core that manages session state, relationships, and NPC brain projections.
 */
export class PixSim7Core implements IPixSim7Core {
  private session: GameSessionDTO | null = null;
  private events = new TypedEventEmitter<CoreEventMap>();
  private config: PixSim7CoreConfig;

  // Cache for brain states (data-driven BrainState)
  private brainCache = new Map<number, BrainState>();

  // Cache for NPC personas (fetched via NpcPersonaProvider)
  private personaCache = new Map<number, any>();

  // Cache for derived stats (fetched via DerivedStatPreviewProvider)
  // Key: npcId, Value: Map of targetStatId -> preview result
  private derivedStatsCache = new Map<number, Map<string, DerivedStatPreviewResult>>();

  constructor(config: PixSim7CoreConfig = {}) {
    this.config = config;
  }

  /**
   * Load a session from the API or storage
   */
  async loadSession(sessionId: number): Promise<void> {
    let session: GameSessionDTO | null = null;

    // Try storage provider first if available
    if (this.config.storageProvider) {
      session = await this.config.storageProvider.loadLocalSession(sessionId);
    }

    // Fall back to API client if storage fails
    if (!session && this.config.apiClient) {
      session = await this.config.apiClient.fetchSession(sessionId);
    }

    if (!session) {
      throw new Error(`Failed to load session ${sessionId}`);
    }

    this.session = session;
    this.brainCache.clear();
    this.personaCache.clear(); // Clear persona cache on session load
    this.derivedStatsCache.clear(); // Clear derived stats cache on session load
    this.events.emit('sessionLoaded', { session });
  }

  /**
   * Get the current session
   */
  getSession(): GameSessionDTO | null {
    return this.session;
  }

  /**
   * Get NPC relationship state
   */
  getNpcRelationship(npcId: number): NpcRelationshipState | null {
    if (!this.session) return null;

    return getNpcRelationshipState(this.session, npcId);
  }

  /**
   * Update NPC relationship state
   */
  updateNpcRelationship(npcId: number, patch: Partial<NpcRelationshipState>): void {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    // Use the adapter to update relationship state (returns new session)
    this.session = setNpcRelationshipState(this.session, npcId, patch);

    // Invalidate brain cache for this NPC
    this.brainCache.delete(npcId);

    // Invalidate derived stats cache (relationship changes affect derived stats like mood)
    this.derivedStatsCache.delete(npcId);

    // Emit events
    const updatedRelationship = this.getNpcRelationship(npcId);
    if (updatedRelationship) {
      this.events.emit('relationshipChanged', { npcId, relationship: updatedRelationship });
    }
    this.events.emit('sessionUpdated', { session: this.session });
  }

  /**
   * Preload NPC persona from the configured NpcPersonaProvider
   *
   * This method fetches persona data for a specific NPC and stores it
   * in the internal persona cache. Subsequent calls to getNpcBrainState
   * will use the cached persona when building brain state.
   *
   * Usage pattern:
   * ```ts
   * await core.preloadNpcPersona(npcId);
   * const brain = core.getNpcBrainState(npcId); // Uses cached persona
   * ```
   *
   * @param npcId - NPC ID to fetch persona for
   * @throws Error if no session is loaded or no persona provider configured
   */
  async preloadNpcPersona(npcId: number): Promise<void> {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    if (!this.config.npcPersonaProvider) {
      throw new Error('No NpcPersonaProvider configured');
    }

    // Skip if already cached
    if (this.personaCache.has(npcId)) {
      return;
    }

    const persona = await this.config.npcPersonaProvider.getNpcPersona(npcId);
    if (persona) {
      this.personaCache.set(npcId, persona);
      // Invalidate brain cache for this NPC so it rebuilds with new persona
      this.brainCache.delete(npcId);
      // Emit persona:loaded event
      this.events.emit('persona:loaded', { npcId, persona });
    }
  }

  /**
   * Get cached persona for an NPC (if available)
   *
   * @param npcId - NPC ID
   * @returns Cached persona or undefined
   */
  getCachedPersona(npcId: number): any | undefined {
    return this.personaCache.get(npcId);
  }

  /**
   * Invalidate cached persona for an NPC
   *
   * Removes the persona from cache and invalidates the brain state cache.
   * The next call to getNpcBrainState will rebuild brain state without
   * the cached persona (unless preloadNpcPersona is called again).
   *
   * @param npcId - NPC ID to invalidate persona for
   */
  invalidatePersona(npcId: number): void {
    this.personaCache.delete(npcId);
    this.brainCache.delete(npcId);
    this.events.emit('persona:invalidated', { npcId });
  }

  /**
   * Preload derived stats for an NPC using the backend preview API
   *
   * This method calls the DerivedStatPreviewProvider to compute derived stats
   * (like mood) from current relationship values. Results are cached for use
   * by getNpcBrainState.
   *
   * If no provider is configured, silently returns (derived stats skipped).
   * worldId=0 is valid for editor mode (backend uses default packages).
   *
   * Usage pattern:
   * ```ts
   * await core.preloadDerivedStats(npcId);
   * const brain = core.getNpcBrainState(npcId); // Uses cached derived stats
   * ```
   *
   * @param npcId - NPC ID to compute derived stats for
   */
  async preloadDerivedStats(npcId: number): Promise<void> {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    if (!this.config.derivedStatPreviewProvider) {
      // No provider configured - derived stats will be skipped silently
      return;
    }

    const relationship = this.getNpcRelationship(npcId);
    if (!relationship) {
      return;
    }

    // worldId 0 is valid for editor mode - backend handles it
    const worldId = this.config.worldId ?? 0;

    // Build input values from relationship
    const inputValues: Record<string, Record<string, number>> = {
      relationships: relationship.values,
    };

    // Get stat definitions to find which stats need derivation
    const statsConfig = this.getStatsConfig();
    const derivedDefs = Object.entries(statsConfig.definitions).filter(
      ([, def]) => def.source === 'derived'
    );

    if (derivedDefs.length === 0) {
      return;
    }

    // Initialize cache for this NPC
    if (!this.derivedStatsCache.has(npcId)) {
      this.derivedStatsCache.set(npcId, new Map());
    }
    const npcCache = this.derivedStatsCache.get(npcId)!;

    // Fetch each derived stat - silently skip on errors (no noisy warnings)
    for (const [defId] of derivedDefs) {
      try {
        const result = await this.config.derivedStatPreviewProvider.previewDerivedStat(
          worldId,
          defId,
          inputValues
        );
        if (result) {
          npcCache.set(defId, result);
        }
      } catch {
        // Silently skip - derived stat will be omitted from brain state
      }
    }

    // Invalidate brain cache so it rebuilds with new derived stats
    this.brainCache.delete(npcId);
  }

  /**
   * Get cached derived stats for an NPC (if available)
   *
   * @param npcId - NPC ID
   * @returns Cached derived stats map or undefined
   */
  getCachedDerivedStats(npcId: number): Record<string, unknown> | undefined {
    const npcCache = this.derivedStatsCache.get(npcId);
    if (!npcCache || npcCache.size === 0) {
      return undefined;
    }

    // Flatten to single record
    const result: Record<string, unknown> = {};
    for (const [statId, previewResult] of npcCache) {
      result[statId] = previewResult.derivedValues;
    }
    return result;
  }

  /**
   * Invalidate cached derived stats for an NPC
   *
   * @param npcId - NPC ID to invalidate derived stats for
   */
  invalidateDerivedStats(npcId: number): void {
    this.derivedStatsCache.delete(npcId);
    this.brainCache.delete(npcId);
  }

  /**
   * Get NPC brain state (data-driven BrainState)
   *
   * Builds a data-driven BrainState from session stats and relationships.
   * The structure adapts to whatever stat packages the world uses.
   *
   * If an NpcPersonaProvider is configured and persona has been preloaded
   * via preloadNpcPersona(), personality traits will be included.
   *
   * For async persona fetching, use the pattern:
   * ```ts
   * await core.preloadNpcPersona(npcId);
   * const brain = core.getNpcBrainState(npcId);
   * ```
   */
  getNpcBrainState(npcId: number): BrainState | null {
    if (!this.session) return null;

    // Check cache first
    if (this.brainCache.has(npcId)) {
      return this.brainCache.get(npcId)!;
    }

    // Build data-driven brain state
    const brain = this.buildBrainState(npcId);
    if (!brain) return null;

    this.brainCache.set(npcId, brain);
    return brain;
  }

  /**
   * Get stats configuration from provider or use defaults
   */
  private getStatsConfig(): WorldStatsConfig {
    return this.config.statConfigProvider?.getStatsConfig() ?? DEFAULT_WORLD_STATS_CONFIG;
  }

  /**
   * Get stat definition by ID from current config
   */
  private getStatDefinition(defId: string): StatDefinition | undefined {
    return this.getStatsConfig().definitions[defId];
  }

  /**
   * Build data-driven BrainState from session data
   *
   * Uses statConfigProvider (if available) to iterate over stat definitions dynamically.
   * This allows new stat types to be added via config without code changes.
   */
  private buildBrainState(npcId: number): BrainState | null {
    if (!this.session) return null;

    const relationship = this.getNpcRelationship(npcId);
    const persona = this.personaCache.get(npcId);
    const flags = this.session.flags as Record<string, unknown>;
    const npcOverrides = (flags?.npcs as Record<string, unknown>)?.[`npc:${npcId}`] as Record<string, unknown> | undefined;

    const stats: Record<string, BrainStatSnapshot> = {};
    const derived: Record<string, unknown> = {};
    const sourcePackages: string[] = [];

    const statsConfig = this.getStatsConfig();

    // Process each stat definition from config based on definition.source
    for (const [defId, definition] of Object.entries(statsConfig.definitions)) {
      const statSnapshot = this.buildStatSnapshot(
        defId,
        definition,
        relationship,
        persona,
        npcOverrides,
        npcId
      );

      if (statSnapshot) {
        stats[defId] = statSnapshot.snapshot;
        sourcePackages.push(statSnapshot.sourcePackage);

        // Merge derived values
        if (statSnapshot.derived) {
          Object.assign(derived, statSnapshot.derived);
        }
      }
    }

    // Store persona tags in derived
    const tags: string[] = [];
    if (persona?.tags && Array.isArray(persona.tags)) {
      tags.push(...persona.tags);
    }
    if (npcOverrides?.personaTags && Array.isArray(npcOverrides.personaTags)) {
      tags.push(...(npcOverrides.personaTags as string[]));
    }
    if (tags.length > 0) {
      derived['persona_tags'] = [...new Set(tags)];
    }

    return {
      npcId: NpcId(npcId),
      worldId: WorldId(0), // World ID not stored in session; would need to be passed in
      stats,
      derived,
      computedAt: Date.now(),
      sourcePackages,
    };
  }

  /**
   * Build stat snapshot for a specific definition
   *
   * Routes to appropriate builder based on definition.source:
   * - 'session.relationships': From session relationship state (backend-normalized)
   * - 'persona.traits': From persona provider + session overrides
   * - 'derived': From cached preview API results (backend-authoritative)
   * - 'session.stats': From session.stats[defId]
   */
  private buildStatSnapshot(
    defId: string,
    definition: StatDefinition,
    relationship: NpcRelationshipState | null,
    persona: any,
    npcOverrides: Record<string, unknown> | undefined,
    npcId: number
  ): { snapshot: BrainStatSnapshot; sourcePackage: string; derived?: Record<string, unknown> } | null {
    const source = definition.source ?? 'session.stats';

    switch (source) {
      case 'session.relationships':
        return this.buildRelationshipSnapshot(definition, relationship);

      case 'persona.traits':
        return this.buildPersonalitySnapshot(definition, persona, npcOverrides);

      case 'derived':
        return this.buildDerivedSnapshot(defId, definition, npcId);

      case 'session.stats':
      default:
        return this.buildGenericSnapshot(definition);
    }
  }

  /**
   * Build relationship stat snapshot from session data
   */
  private buildRelationshipSnapshot(
    definition: StatDefinition,
    relationship: NpcRelationshipState | null
  ): { snapshot: BrainStatSnapshot; sourcePackage: string; derived?: Record<string, unknown> } | null {
    if (!relationship) return null;

    const rv = relationship.values;
    const backendTiers = relationship.tiers || {};

    // Get axis names from definition instead of hardcoding
    const axisNames = definition.axes.map(a => a.name);
    const axes: Record<string, number> = {};
    const tiers: Record<string, string> = {};

    for (const axisName of axisNames) {
      axes[axisName] = rv[axisName] ?? 0;
      if (backendTiers[axisName]) {
        tiers[axisName] = backendTiers[axisName];
      }
    }

    const derived: Record<string, unknown> = {};
    if (relationship.levelId) {
      derived['intimacy_level'] = relationship.levelId;
    }
    derived['relationship_is_normalized'] = relationship.isNormalized ?? false;

    return {
      snapshot: {
        axes,
        tiers,
        levelId: relationship.levelId ?? relationship.tierId ?? undefined,
        levelIds: relationship.levelId ? [relationship.levelId] : [],
      },
      sourcePackage: `core.${definition.id}`,
      derived,
    };
  }

  /**
   * Build personality stat snapshot from persona data
   */
  private buildPersonalitySnapshot(
    definition: StatDefinition,
    persona: any,
    npcOverrides: Record<string, unknown> | undefined
  ): { snapshot: BrainStatSnapshot; sourcePackage: string } | null {
    const axisNames = definition.axes.map(a => a.name);
    let axes: Record<string, number> = {};
    let hasData = false;

    // Get base traits from persona
    if (persona?.traits && typeof persona.traits === 'object') {
      const traits = persona.traits as Record<string, number>;
      for (const axisName of axisNames) {
        if (traits[axisName] !== undefined) {
          axes[axisName] = traits[axisName];
          hasData = true;
        }
      }
      // Also include any traits not in definition (extensible)
      for (const [k, v] of Object.entries(traits)) {
        if (typeof v === 'number' && axes[k] === undefined) {
          axes[k] = v;
          hasData = true;
        }
      }
    }

    // Apply session overrides
    if (npcOverrides?.personality) {
      const overridePersonality = npcOverrides.personality as Record<string, unknown>;
      if (overridePersonality.traits && typeof overridePersonality.traits === 'object') {
        const overrideTraits = overridePersonality.traits as Record<string, number>;
        axes = { ...axes, ...overrideTraits };
        hasData = true;
      }
    }

    if (!hasData) return null;

    // Compute tiers locally (personality isn't session-normalized yet)
    const tiers = Object.fromEntries(
      Object.entries(axes).map(([k, v]) => [k, this.computeTierFallback(v)])
    );

    return {
      snapshot: { axes, tiers },
      sourcePackage: `core.${definition.id}`,
    };
  }

  /**
   * Build derived stat snapshot from cached preview API results
   *
   * Uses preloaded derived stats from DerivedStatPreviewProvider.
   * Backend DerivationEngine is the single source of truth for derivations.
   *
   * Returns null if:
   * - No derivedStatPreviewProvider configured
   * - No cached result for this stat (call preloadDerivedStats first)
   *
   * No local fallback computation - backend is authoritative.
   */
  private buildDerivedSnapshot(
    defId: string,
    definition: StatDefinition,
    npcId: number
  ): { snapshot: BrainStatSnapshot; sourcePackage: string; derived?: Record<string, unknown> } | null {
    // Get cached preview result for this NPC and stat
    const npcCache = this.derivedStatsCache.get(npcId);
    const previewResult = npcCache?.get(defId);

    if (!previewResult) {
      // No cached result - derived stat will be skipped
      // Caller should use preloadDerivedStats() first
      return null;
    }

    const derivedValues = previewResult.derivedValues;

    // Extract axis values (numeric values from derived result)
    const axes: Record<string, number> = {};
    for (const axis of definition.axes) {
      const value = derivedValues[axis.name];
      if (typeof value === 'number') {
        axes[axis.name] = value;
      }
    }

    // Use backend-computed tiers (don't compute locally)
    const tiers = previewResult.tiers || {};

    // Extract level ID from backend result
    const levelId = typeof derivedValues.label === 'string'
      ? derivedValues.label
      : undefined;

    return {
      snapshot: { axes, tiers, levelId },
      sourcePackage: `backend.${defId}`,
      derived: {
        [defId]: {
          ...derivedValues,
          source: 'backend_derivation',
        },
      },
    };
  }

  /**
   * Build snapshot for generic stat types (from session.stats)
   */
  private buildGenericSnapshot(
    definition: StatDefinition
  ): { snapshot: BrainStatSnapshot; sourcePackage: string } | null {
    // Try to get from session.stats (future extension point)
    // For now, return null - unknown stat types need explicit handling
    return null;
  }

  /**
   * @deprecated Use backend-computed tiers from StatEngine.normalize_entity_stats()
   *
   * Local fallback for tier computation when backend values not available.
   * This should only be used for stats not stored in session (e.g., personality).
   * For relationships, use relationship.tiers from backend.
   */
  private computeTierFallback(value: number): string {
    if (value < 20) return 'very_low';
    if (value < 40) return 'low';
    if (value < 60) return 'moderate';
    if (value < 80) return 'high';
    return 'very_high';
  }

  /**
   * Apply edits to NPC brain state
   *
   * Supports partial updates to stats and derived values.
   */
  applyNpcBrainEdit(npcId: number, edit: Partial<BrainState>): void {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    const current = this.getNpcBrainState(npcId);
    if (!current) {
      throw new Error(`NPC ${npcId} not found`);
    }

    // Apply edits (deep merge for stats and derived)
    const updated: BrainState = {
      ...current,
      ...edit,
      stats: {
        ...current.stats,
        ...(edit.stats || {}),
      },
      derived: {
        ...current.derived,
        ...(edit.derived || {}),
      },
      computedAt: Date.now(),
    };

    // Update cache
    this.brainCache.set(npcId, updated);

    // Emit event
    this.events.emit('npcBrainChanged', { npcId, brain: updated });
  }

  /**
   * Subscribe to events
   */
  on<K extends keyof CoreEventMap>(
    event: K,
    handler: (payload: CoreEventMap[K]) => void
  ): () => void {
    return this.events.on(event, handler);
  }
}

/**
 * Factory function to create a PixSim7Core instance
 */
export function createPixSim7Core(config: PixSim7CoreConfig = {}): IPixSim7Core {
  return new PixSim7Core(config);
}
