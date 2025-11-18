import type { GameSessionDTO } from '@pixsim7/types';
import type {
  PixSim7Core as IPixSim7Core,
  PixSim7CoreConfig,
  CoreEventMap,
  NpcRelationshipState,
  NpcBrainState,
} from './types';
import {
  compute_relationship_tier,
  compute_intimacy_level,
  extract_relationship_values,
} from '../relationships/computation';
import { buildNpcBrainState } from '../npcs/brain';

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

  // Cache for brain states
  private brainCache = new Map<number, NpcBrainState>();

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

    const npcKey = `npc:${npcId}`;
    const raw = this.session.relationships[npcKey] as Record<string, any> | undefined;

    const [affinity, trust, chemistry, tension, flags] = extract_relationship_values(
      this.session.relationships,
      npcId
    );

    // Prefer backend-computed tierId and intimacyLevelId
    // Only compute as fallback if not provided
    let tierId = typeof raw?.tierId === 'string' ? raw.tierId : undefined;
    let intimacyLevelId = raw?.intimacyLevelId !== undefined ? raw.intimacyLevelId : undefined;

    if (!tierId) {
      tierId = compute_relationship_tier(affinity);
    }
    if (intimacyLevelId === undefined) {
      intimacyLevelId = compute_intimacy_level({ affinity, trust, chemistry, tension });
    }

    return {
      affinity,
      trust,
      chemistry,
      tension,
      flags: Array.isArray(flags) ? flags : [],
      tierId,
      intimacyLevelId,
      raw,
    };
  }

  /**
   * Update NPC relationship state
   */
  updateNpcRelationship(npcId: number, patch: Partial<NpcRelationshipState>): void {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    const npcKey = `npc:${npcId}`;
    const current = this.session.relationships[npcKey] as Record<string, any> | undefined || {};

    // Apply patches
    if (patch.affinity !== undefined) current.affinity = patch.affinity;
    if (patch.trust !== undefined) current.trust = patch.trust;
    if (patch.chemistry !== undefined) current.chemistry = patch.chemistry;
    if (patch.tension !== undefined) current.tension = patch.tension;
    if (patch.flags !== undefined) current.flags = patch.flags;

    this.session.relationships[npcKey] = current;

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
   * Get NPC brain state (uses cache)
   *
   * If an NpcPersonaProvider is configured, it will fetch persona data
   * and merge it with session overrides when building the brain state.
   */
  getNpcBrainState(npcId: number): NpcBrainState | null {
    if (!this.session) return null;

    // Check cache first
    if (this.brainCache.has(npcId)) {
      return this.brainCache.get(npcId)!;
    }

    // Build brain state
    const relationship = this.getNpcRelationship(npcId);
    if (!relationship) return null;

    // Fetch persona if provider is available
    // Note: This is synchronous for now; in a full implementation,
    // getNpcBrainState might need to become async or use a pre-loaded cache
    let persona;
    if (this.config.npcPersonaProvider) {
      // For now, we skip async persona fetching in the sync API
      // Future enhancement: Add async getNpcBrainStateAsync or pre-load personas
      persona = undefined;
    }

    const brain = buildNpcBrainState({
      npcId,
      session: this.session,
      relationship,
      persona,
    });

    this.brainCache.set(npcId, brain);
    return brain;
  }

  /**
   * Apply edits to NPC brain state
   */
  applyNpcBrainEdit(npcId: number, edit: Partial<NpcBrainState>): void {
    if (!this.session) {
      throw new Error('No session loaded');
    }

    const current = this.getNpcBrainState(npcId);
    if (!current) {
      throw new Error(`NPC ${npcId} not found`);
    }

    // Apply edits (deep merge)
    const updated: NpcBrainState = {
      ...current,
      ...edit,
      traits: { ...current.traits, ...(edit.traits || {}) },
      mood: { ...current.mood, ...(edit.mood || {}) },
      logic: { ...current.logic, ...(edit.logic || {}) },
      social: { ...current.social, ...(edit.social || {}) },
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
