import type { GameSessionDTO, BrainState, BrainStatSnapshot } from '@pixsim7/shared.types';
import { WorldId, NpcId } from '@pixsim7/shared.types';
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
   * Build data-driven BrainState from session data
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

    // Build relationships stat if we have relationship data
    if (relationship) {
      sourcePackages.push('core.relationships');
      stats['relationships'] = {
        axes: {
          affinity: relationship.affinity,
          trust: relationship.trust,
          chemistry: relationship.chemistry,
          tension: relationship.tension,
        },
        tiers: {
          // Compute tiers based on 0-20-40-60-80 ranges
          affinity: this.computeTier(relationship.affinity),
          trust: this.computeTier(relationship.trust),
          chemistry: this.computeTier(relationship.chemistry),
          tension: this.computeTier(relationship.tension),
        },
        levelId: relationship.tierId,
        levelIds: relationship.tierId ? [relationship.tierId] : [],
      };

      // Store intimacy level in derived for easy access
      if (relationship.intimacyLevelId) {
        derived['intimacy_level'] = relationship.intimacyLevelId;
      }
    }

    // Build personality stat from persona
    if (persona?.traits && typeof persona.traits === 'object') {
      sourcePackages.push('core.personality');
      const traits = persona.traits as Record<string, number>;
      stats['personality'] = {
        axes: { ...traits },
        tiers: Object.fromEntries(
          Object.entries(traits).map(([k, v]) => [k, this.computeTier(v)])
        ),
      };
    }

    // Check for session overrides on personality
    if (npcOverrides?.personality) {
      const overridePersonality = npcOverrides.personality as Record<string, unknown>;
      if (overridePersonality.traits && typeof overridePersonality.traits === 'object') {
        const overrideTraits = overridePersonality.traits as Record<string, number>;
        if (!stats['personality']) {
          sourcePackages.push('core.personality');
          stats['personality'] = { axes: {}, tiers: {} };
        }
        stats['personality'].axes = { ...stats['personality'].axes, ...overrideTraits };
        stats['personality'].tiers = Object.fromEntries(
          Object.entries(stats['personality'].axes).map(([k, v]) => [k, this.computeTier(v)])
        );
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

    // Derive mood from relationships (simple local derivation)
    // In production, this would come from backend via DerivationEngine
    if (relationship) {
      const valence = relationship.affinity * 0.6 + relationship.chemistry * 0.4;
      const arousal = relationship.chemistry * 0.5 + relationship.tension * 0.5;

      sourcePackages.push('core.mood');
      stats['mood'] = {
        axes: { valence, arousal },
        tiers: {
          valence: this.computeTier(valence),
          arousal: this.computeTier(arousal),
        },
        levelId: this.computeMoodLabel(valence, arousal),
      };

      // Also store mood in derived for convenience
      derived['mood'] = {
        valence,
        arousal,
        label: stats['mood'].levelId,
        source: 'derived_from_relationships',
      };
    }

    // Derive conversation style
    const conversationStyle = this.deriveConversationStyle(
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
   * Compute tier from value (0-100 scale)
   */
  private computeTier(value: number): string {
    if (value < 20) return 'very_low';
    if (value < 40) return 'low';
    if (value < 60) return 'moderate';
    if (value < 80) return 'high';
    return 'very_high';
  }

  /**
   * Compute mood label from valence/arousal
   */
  private computeMoodLabel(valence: number, arousal: number): string {
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
   * Derive conversation style from personality and relationship
   */
  private deriveConversationStyle(
    traits: Record<string, number>,
    relationship: NpcRelationshipState | null
  ): string {
    const extraversion = traits.extraversion ?? 50;
    const agreeableness = traits.agreeableness ?? 50;
    const affinity = relationship?.affinity ?? 50;

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
