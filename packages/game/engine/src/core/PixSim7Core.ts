import type { GameSessionDTO, BrainState, BrainStatSnapshot, WorldStatsConfig, StatDefinition } from '@pixsim7/shared.types';
import { WorldId, NpcId, DEFAULT_WORLD_STATS_CONFIG } from '@pixsim7/shared.types';
import type {
  PixSim7Core as IPixSim7Core,
  PixSim7CoreConfig,
  CoreEventMap,
  NpcRelationshipState,
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

    // Process each stat definition from config
    for (const [defId, definition] of Object.entries(statsConfig.definitions)) {
      const statSnapshot = this.buildStatSnapshot(
        defId,
        definition,
        relationship,
        persona,
        npcOverrides
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

    // Derive conversation style (still uses local fallback)
    // TODO: Move to backend derivation engine
    const conversationStyle = this.deriveConversationStyleFallback(
      stats['personality']?.axes || {},
      relationship
    );
    if (conversationStyle) {
      derived['conversation_style'] = conversationStyle;
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
   * Determines data source based on definition ID:
   * - 'relationships': From session relationship state (backend-normalized)
   * - 'personality': From persona provider + session overrides
   * - Others: Try to extract from session.stats[defId] or use derivation
   */
  private buildStatSnapshot(
    defId: string,
    definition: StatDefinition,
    relationship: NpcRelationshipState | null,
    persona: any,
    npcOverrides: Record<string, unknown> | undefined
  ): { snapshot: BrainStatSnapshot; sourcePackage: string; derived?: Record<string, unknown> } | null {
    const axisNames = definition.axes.map(a => a.name);

    // Handle known stat types
    switch (defId) {
      case 'relationships':
        return this.buildRelationshipSnapshot(definition, relationship);

      case 'personality':
        return this.buildPersonalitySnapshot(definition, persona, npcOverrides);

      case 'mood':
        return this.buildMoodSnapshot(definition, relationship);

      default:
        // For unknown stat types, try to extract from session.stats
        return this.buildGenericSnapshot(defId, definition);
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
    if (relationship.intimacyLevelId) {
      derived['intimacy_level'] = relationship.intimacyLevelId;
    }
    derived['relationship_is_normalized'] = relationship.isNormalized ?? false;

    return {
      snapshot: {
        axes,
        tiers,
        levelId: relationship.intimacyLevelId ?? relationship.tierId ?? undefined,
        levelIds: relationship.intimacyLevelId ? [relationship.intimacyLevelId] : [],
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
   * Build mood stat snapshot (derived from relationships using semantic types)
   *
   * Uses semantic_type on relationship axes to determine which axes contribute
   * to which mood axis. This mirrors the backend's DerivationCapability approach.
   *
   * Semantic type mappings (from backend mood_package.py):
   * - positive_sentiment → contributes to valence (positive)
   * - negative_sentiment → contributes to valence (negative)
   * - arousal_source → contributes to arousal
   *
   * TODO: Use backend mood preview API for authoritative computation
   */
  private buildMoodSnapshot(
    definition: StatDefinition,
    relationship: NpcRelationshipState | null
  ): { snapshot: BrainStatSnapshot; sourcePackage: string; derived?: Record<string, unknown> } | null {
    if (!relationship) return null;

    const rv = relationship.values;
    const statsConfig = this.getStatsConfig();
    const relationshipDef = statsConfig.definitions['relationships'];

    // Build semantic type → relationship axes mapping
    const semanticTypeToAxes = this.buildSemanticTypeMapping(relationshipDef);

    // Compute each mood axis dynamically from definition
    const axes: Record<string, number> = {};
    const tiers: Record<string, string> = {};

    for (const moodAxis of definition.axes) {
      const axisName = moodAxis.name;
      const semanticType = moodAxis.semantic_type;

      // Find contributing relationship axes by semantic type
      const value = this.computeDerivedAxisValue(
        axisName,
        semanticType,
        semanticTypeToAxes,
        rv,
        moodAxis.default_value ?? 50
      );

      axes[axisName] = value;
      tiers[axisName] = this.computeTierFallback(value);
    }

    // Compute level (mood label) using axes
    const levelId = this.computeMoodLevelFromAxes(axes, definition);

    return {
      snapshot: { axes, tiers, levelId },
      sourcePackage: `core.${definition.id}`,
      derived: {
        mood: {
          ...axes,
          label: levelId,
          source: 'semantic_derivation',
        },
      },
    };
  }

  /**
   * Build mapping from semantic_type to relationship axes
   */
  private buildSemanticTypeMapping(
    relationshipDef: StatDefinition | undefined
  ): Map<string, { name: string; weight: number }[]> {
    const mapping = new Map<string, { name: string; weight: number }[]>();

    if (!relationshipDef?.axes) return mapping;

    for (const axis of relationshipDef.axes) {
      if (!axis.semantic_type) continue;

      const existing = mapping.get(axis.semantic_type) || [];
      existing.push({
        name: axis.name,
        weight: axis.semantic_weight ?? 1.0,
      });
      mapping.set(axis.semantic_type, existing);
    }

    return mapping;
  }

  /**
   * Compute derived axis value from contributing relationship axes
   *
   * Uses semantic type to find contributors. Falls back to default if no match.
   */
  private computeDerivedAxisValue(
    axisName: string,
    semanticType: string | undefined,
    semanticTypeToAxes: Map<string, { name: string; weight: number }[]>,
    relationshipValues: Record<string, number>,
    defaultValue: number
  ): number {
    // Try to find contributors by semantic type
    if (semanticType) {
      const contributors = semanticTypeToAxes.get(semanticType);
      if (contributors && contributors.length > 0) {
        return this.computeWeightedAverage(contributors, relationshipValues);
      }
    }

    // Fallback: try common semantic type mappings for known mood axes
    // This provides backward compatibility while config is being updated
    const fallbackMappings: Record<string, string[]> = {
      valence: ['positive_sentiment', 'arousal_source'],
      arousal: ['arousal_source', 'negative_sentiment'],
    };

    const fallbackTypes = fallbackMappings[axisName];
    if (fallbackTypes) {
      const allContributors: { name: string; weight: number }[] = [];
      for (const fallbackType of fallbackTypes) {
        const contributors = semanticTypeToAxes.get(fallbackType);
        if (contributors) {
          allContributors.push(...contributors);
        }
      }
      if (allContributors.length > 0) {
        return this.computeWeightedAverage(allContributors, relationshipValues);
      }
    }

    // No contributors found - return default
    return defaultValue;
  }

  /**
   * Compute weighted average from contributing axes
   */
  private computeWeightedAverage(
    contributors: { name: string; weight: number }[],
    values: Record<string, number>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const contributor of contributors) {
      const value = values[contributor.name] ?? 0;
      weightedSum += value * contributor.weight;
      totalWeight += contributor.weight;
    }

    if (totalWeight === 0) return 0;
    return weightedSum / totalWeight;
  }

  /**
   * Compute mood level from axes using definition levels
   *
   * Falls back to simple label computation if no levels defined.
   */
  private computeMoodLevelFromAxes(
    axes: Record<string, number>,
    definition: StatDefinition
  ): string {
    // Try to match levels from definition (sorted by priority descending)
    if (definition.levels && definition.levels.length > 0) {
      const sortedLevels = [...definition.levels].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      for (const level of sortedLevels) {
        if (this.matchesLevelConditions(axes, level.conditions)) {
          return level.id;
        }
      }
    }

    // Fallback: use valence/arousal if present, else return 'neutral'
    const valence = axes['valence'];
    const arousal = axes['arousal'];

    if (valence !== undefined && arousal !== undefined) {
      return this.computeMoodLabelFallback(valence, arousal);
    }

    return 'neutral';
  }

  /**
   * Check if axes match level conditions
   */
  private matchesLevelConditions(
    axes: Record<string, number>,
    conditions: Record<string, { type: string; min_value?: number; max_value?: number }>
  ): boolean {
    for (const [axisName, condition] of Object.entries(conditions)) {
      const value = axes[axisName];
      if (value === undefined) return false;

      switch (condition.type) {
        case 'min':
          if (condition.min_value !== undefined && value < condition.min_value) return false;
          break;
        case 'max':
          if (condition.max_value !== undefined && value > condition.max_value) return false;
          break;
        case 'range':
          if (condition.min_value !== undefined && value < condition.min_value) return false;
          if (condition.max_value !== undefined && value > condition.max_value) return false;
          break;
      }
    }
    return true;
  }

  /**
   * Build snapshot for generic stat types (from session.stats)
   */
  private buildGenericSnapshot(
    defId: string,
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
   * @deprecated Use backend mood preview API: POST /stats/preview-mood
   *
   * Local fallback for mood label computation.
   * Backend has proper derivation engine with world-specific formulas.
   */
  private computeMoodLabelFallback(valence: number, arousal: number): string {
    if (valence >= 70 && arousal >= 70) return 'excited';
    if (valence >= 70 && arousal < 30) return 'content';
    if (valence >= 60 && arousal >= 50) return 'happy';
    if (valence >= 60 && arousal < 40) return 'calm';
    if (valence < 40 && arousal >= 70) return 'anxious';
    if (valence < 30 && arousal >= 80) return 'angry';
    if (valence < 30 && arousal < 40) return 'sad';
    if (valence < 40 && arousal < 30) return 'bored';
    return 'neutral';
  }

  /**
   * @deprecated Use backend derivation engine for conversation style
   *
   * Local fallback for conversation style derivation.
   * Backend can use world-specific formulas and semantic type mappings.
   */
  private deriveConversationStyleFallback(
    traits: Record<string, number>,
    relationship: NpcRelationshipState | null
  ): string {
    const extraversion = traits.extraversion ?? 50;
    const agreeableness = traits.agreeableness ?? 50;
    const affinity = relationship?.values.affinity ?? 50;

    if (affinity >= 60 && agreeableness >= 60) return 'warm';
    if (affinity >= 40 && extraversion >= 60) return 'friendly';
    if (affinity < 30) return 'distant';
    return 'neutral';
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
