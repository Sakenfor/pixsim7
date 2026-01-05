/**
 * GameRuntime implementation
 *
 * Core runtime that owns the client-side view of GameSessionDTO + GameWorldDetail
 * and provides methods to load/save sessions, apply interactions, and advance world time.
 */

import type {
  GameSessionDTO,
  GameWorldDetail,
  ExecuteInteractionResponse,
  TemplateKind,
} from '@pixsim7/shared.types';
import { createTemplateRefKey } from '@pixsim7/shared.types';
import type {
  GameRuntime as IGameRuntime,
  GameRuntimeConfig,
  GameRuntimeEvents,
  InteractionIntent,
  SessionChanges,
  SessionLoadedEvent,
  SessionUpdatedEvent,
  NpcRelationshipChangedEvent,
  WorldTimeAdvancedEvent,
  InteractionExecutedEvent,
  RuntimeErrorEvent,
} from './types';
import type { NpcRelationshipState } from '../core/types';
import { getNpcRelationshipState } from '../session/state';

/**
 * Simple typed event emitter (reused from PixSim7Core)
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

  off<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void
  ): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      });
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/**
 * GameRuntime implementation
 */
export class GameRuntime implements IGameRuntime {
  private session: GameSessionDTO | null = null;
  private world: GameWorldDetail | null = null;
  private events = new TypedEventEmitter<GameRuntimeEvents>();
  private config: GameRuntimeConfig;
  private disposed = false;

  // Track NPC relationship states for change detection
  private relationshipCache = new Map<number, NpcRelationshipState>();

  // Cache for template→runtime resolution (keyed by "templateKind:templateId")
  private templateCache = new Map<string, number | null>();

  constructor(config: GameRuntimeConfig) {
    this.config = config;
    this.log('GameRuntime initialized');
  }

  // ============================================
  // Template Resolution (ObjectLink system)
  // ============================================

  /**
   * Resolve a template entity to its linked runtime entity ID.
   * Uses the ObjectLink system with context-based activation.
   * Results are cached for the session duration.
   *
   * @param templateKind - Template entity kind (e.g., 'characterInstance')
   * @param templateId - Template entity ID
   * @returns Runtime entity ID, or null if no active link found
   */
  async resolveTemplateToRuntime(
    templateKind: TemplateKind,
    templateId: string
  ): Promise<number | null> {
    const cacheKey = createTemplateRefKey(templateKind, templateId);

    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey) ?? null;
    }

    // Check if API client supports template resolution
    if (!this.config.apiClient.resolveTemplate) {
      this.log(`API client does not support resolveTemplate, cannot resolve ${cacheKey}`);
      return null;
    }

    try {
      // Build context from current game state
      const context = this.buildResolutionContext();

      const result = await this.config.apiClient.resolveTemplate(
        templateKind,
        templateId,
        context
      );

      const runtimeId = result.resolved ? (result.runtimeId ?? null) : null;

      // Cache the result
      this.templateCache.set(cacheKey, runtimeId);

      this.log(
        `Resolved ${cacheKey} → ${runtimeId !== null ? `runtime:${runtimeId}` : 'not found'}`
      );

      return runtimeId;
    } catch (error) {
      this.log(`Failed to resolve ${cacheKey}: ${error}`);
      // Cache the failure to avoid repeated API calls
      this.templateCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Build resolution context from current game state.
   * Used for activation condition evaluation on the backend.
   */
  private buildResolutionContext(): Record<string, unknown> {
    const session = this.getSession();
    const world = this.getWorld();

    const context: Record<string, unknown> = {};

    // Location context
    if (session?.flags?.currentLocationId) {
      context['location.id'] = session.flags.currentLocationId;
    }
    if (session?.flags?.currentZone) {
      context['location.zone'] = session.flags.currentZone;
    }

    // Time context
    if (world?.world_time !== undefined) {
      const hour = Math.floor(world.world_time / 3600) % 24;
      context['time.hour'] = hour;
      context['time.period'] = this.getTimePeriod(hour);
    }

    // Session context
    if (session?.id) {
      context['session.id'] = session.id;
    }

    return context;
  }

  /**
   * Get time period from hour (for activation conditions)
   */
  private getTimePeriod(hour: number): string {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Invalidate template resolution cache.
   * Call when context changes (location, time, etc.)
   */
  invalidateTemplateCache(): void {
    if (this.templateCache.size > 0) {
      this.log(`Invalidating template cache (${this.templateCache.size} entries)`);
      this.templateCache.clear();
    }
  }

  /**
   * Load a session (and optionally its world)
   */
  async loadSession(sessionId: number, loadWorld: boolean = true): Promise<void> {
    this.checkDisposed();
    this.log(`Loading session ${sessionId}...`);

    try {
      // Try storage provider first if available
      let session: GameSessionDTO | null = null;
      if (this.config.storageProvider) {
        try {
          session = await this.config.storageProvider.loadLocalSession(sessionId);
          if (session) {
            this.log(`Session ${sessionId} loaded from storage`);
          }
        } catch (err) {
          this.log(`Storage provider failed, falling back to API: ${err}`);
        }
      }

      // Fall back to API client
      if (!session) {
        session = await this.config.apiClient.fetchSession(sessionId);
        this.log(`Session ${sessionId} loaded from API`);
      }

      if (!session) {
        throw new Error(`Failed to load session ${sessionId}`);
      }

      // Load world if requested (requires a world to be already set or inferred from session)
      let world: GameWorldDetail | null = null;
      // For now, skip world loading as GameSessionDTO doesn't have world_id
      // This would need to be determined by the caller or from scene metadata

      // Update internal state
      this.session = session;
      this.world = world;
      this.relationshipCache.clear();
      this.templateCache.clear(); // Invalidate template cache on session load

      // Run plugin hooks
      await this.runPluginHook('onSessionLoaded', session);

      // Emit event
      const event: SessionLoadedEvent = { session, world };
      this.events.emit('sessionLoaded', event);

      this.log(`Session ${sessionId} loaded successfully`);
    } catch (error) {
      this.emitError(error as Error, 'loadSession');
      throw error;
    }
  }

  /**
   * Get the current session (read-only)
   */
  getSession(): Readonly<GameSessionDTO> | null {
    return this.session;
  }

  /**
   * Get the current world (read-only)
   */
  getWorld(): Readonly<GameWorldDetail> | null {
    return this.world;
  }

  /**
   * Apply an interaction to the current session.
   * Supports both direct NPC targeting (npcId) and template-based targeting
   * (templateKind + templateId, resolved via ObjectLink).
   */
  async applyInteraction(intent: InteractionIntent): Promise<ExecuteInteractionResponse> {
    this.checkDisposed();

    if (!this.session) {
      throw new Error('No session loaded');
    }

    // Resolve NPC ID - either direct or via template
    let resolvedNpcId = intent.npcId;

    if (intent.templateKind && intent.templateId && resolvedNpcId === undefined) {
      // Template-based targeting: resolve via ObjectLink
      this.log(
        `Resolving template ${intent.templateKind}:${intent.templateId} for interaction ${intent.interactionId}`
      );

      resolvedNpcId = (await this.resolveTemplateToRuntime(
        intent.templateKind,
        intent.templateId
      )) ?? undefined;

      if (resolvedNpcId === undefined) {
        this.log(
          `Failed to resolve ${intent.templateKind}:${intent.templateId} - no active link found`
        );
        return {
          success: false,
          message: `Failed to resolve ${intent.templateKind}:${intent.templateId} to runtime entity`,
          timestamp: Date.now(),
        };
      }

      this.log(`Resolved to NPC ${resolvedNpcId}`);
    }

    if (resolvedNpcId === undefined) {
      throw new Error(
        'InteractionIntent must have either npcId or templateKind+templateId'
      );
    }

    this.log(`Applying interaction: ${intent.interactionId} with NPC ${resolvedNpcId}`);

    try {
      // Run before hooks (can cancel interaction)
      const allowed = await this.runPluginHook('beforeInteraction', intent, this.session);
      if (allowed === false) {
        this.log(`Interaction ${intent.interactionId} was blocked by a plugin`);
        return {
          success: false,
          message: 'Interaction blocked by plugin',
          timestamp: Date.now(),
        };
      }

      // Execute interaction via API
      const response = await this.config.apiClient.executeInteraction({
        worldId: intent.worldId,
        sessionId: intent.sessionId,
        npcId: resolvedNpcId,
        interactionId: intent.interactionId,
        playerInput: intent.playerInput,
        context: intent.context,
      });

      // Update session if provided in response
      if (response.updatedSession) {
        const previousSession = this.session;
        this.session = response.updatedSession as GameSessionDTO;

        // Detect changes and emit events
        const changes = this.detectSessionChanges(previousSession, this.session);
        this.emitSessionUpdated(previousSession, this.session, changes);

        // Check for relationship changes
        this.detectRelationshipChanges(previousSession, this.session);
      }

      // Run after hooks
      await this.runPluginHook('afterInteraction', intent, response, this.session);

      // Emit interaction executed event
      const event: InteractionExecutedEvent = {
        intent,
        response,
        success: response.success,
      };
      this.events.emit('interactionExecuted', event);

      this.log(`Interaction ${intent.interactionId} completed: ${response.success ? 'success' : 'failure'}`);
      return response;
    } catch (error) {
      this.emitError(error as Error, 'applyInteraction');
      throw error;
    }
  }

  /**
   * Advance world time
   */
  async advanceWorldTime(deltaSeconds: number): Promise<void> {
    this.checkDisposed();

    if (!this.session) {
      throw new Error('No session loaded');
    }

    if (!this.world) {
      throw new Error('No world loaded');
    }

    this.log(`Advancing world time by ${deltaSeconds}s`);

    try {
      const previousTime = this.world.world_time;

      // Advance world time via API
      const updatedWorld = await this.config.apiClient.advanceWorldTime(
        this.world.id,
        deltaSeconds
      );

      // Update internal state
      this.world = updatedWorld;

      // Update session's world_time
      const previousSession = this.session;
      this.session = {
        ...this.session,
        world_time: updatedWorld.world_time,
      };

      const changes: SessionChanges = { worldTime: true };
      this.emitSessionUpdated(previousSession, this.session, changes);

      // Invalidate template cache (time-based activation conditions may change)
      this.invalidateTemplateCache();

      // Emit world time advanced event
      const event: WorldTimeAdvancedEvent = {
        worldId: this.world.id,
        previousTime,
        newTime: updatedWorld.world_time,
        deltaSeconds,
      };
      this.events.emit('worldTimeAdvanced', event);

      this.log(`World time advanced to ${updatedWorld.world_time}`);
    } catch (error) {
      this.emitError(error as Error, 'advanceWorldTime');
      throw error;
    }
  }

  /**
   * Get NPC relationship state
   */
  getNpcRelationship(npcId: number): NpcRelationshipState | null {
    if (!this.session) return null;
    return getNpcRelationshipState(this.session, npcId);
  }

  /**
   * Update session (manually)
   */
  async updateSession(updates: Partial<GameSessionDTO>): Promise<void> {
    this.checkDisposed();

    if (!this.session) {
      throw new Error('No session loaded');
    }

    this.log(`Updating session ${this.session.id}...`);

    try {
      const previousSession = this.session;

      // Update via API
      const updatedSession = await this.config.apiClient.updateSession(
        this.session.id,
        updates
      );

      this.session = updatedSession;

      // Detect changes and emit events
      const changes = this.detectSessionChanges(previousSession, updatedSession);
      this.emitSessionUpdated(previousSession, updatedSession, changes);

      // Check for relationship changes
      this.detectRelationshipChanges(previousSession, updatedSession);

      this.log(`Session ${this.session.id} updated`);
    } catch (error) {
      this.emitError(error as Error, 'updateSession');
      throw error;
    }
  }

  /**
   * Save session to backend (if changes are pending)
   */
  async saveSession(): Promise<void> {
    this.checkDisposed();

    if (!this.session) {
      throw new Error('No session loaded');
    }

    this.log(`Saving session ${this.session.id}...`);

    try {
      // Save to storage provider if available
      if (this.config.storageProvider) {
        await this.config.storageProvider.saveLocalSession(this.session);
        this.log(`Session ${this.session.id} saved to storage`);
      }

      // Note: API updates are already handled by updateSession/applyInteraction
      // This method is primarily for storage provider persistence
    } catch (error) {
      this.emitError(error as Error, 'saveSession');
      throw error;
    }
  }

  /**
   * Subscribe to runtime events
   */
  on<K extends keyof GameRuntimeEvents>(
    event: K,
    handler: (payload: GameRuntimeEvents[K]) => void
  ): () => void {
    return this.events.on(event, handler);
  }

  /**
   * Unsubscribe from runtime events
   */
  off<K extends keyof GameRuntimeEvents>(
    event: K,
    handler: (payload: GameRuntimeEvents[K]) => void
  ): void {
    this.events.off(event, handler);
  }

  /**
   * Dispose runtime and clean up resources
   */
  dispose(): void {
    if (this.disposed) return;

    this.log('Disposing runtime...');
    this.events.clear();
    this.session = null;
    this.world = null;
    this.relationshipCache.clear();
    this.templateCache.clear();
    this.disposed = true;
    this.log('Runtime disposed');
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private checkDisposed(): void {
    if (this.disposed) {
      throw new Error('GameRuntime has been disposed');
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[GameRuntime] ${message}`);
    }
  }

  private emitError(error: Error, context: string): void {
    const event: RuntimeErrorEvent = { error, context };
    this.events.emit('error', event);

    if (this.config.debug) {
      console.error(`[GameRuntime] Error in ${context}:`, error);
    }
  }

  private detectSessionChanges(
    previous: GameSessionDTO,
    current: GameSessionDTO
  ): SessionChanges {
    const changes: SessionChanges = {};

    if (previous.flags !== current.flags) {
      changes.flags = true;
    }
    if (previous.stats !== current.stats) {
      changes.stats = true;
    }
    if (previous.world_time !== current.world_time) {
      changes.worldTime = true;
    }
    if (previous.version !== current.version) {
      changes.version = true;
    }

    return changes;
  }

  private emitSessionUpdated(
    previousSession: GameSessionDTO,
    session: GameSessionDTO,
    changes: SessionChanges
  ): void {
    const event: SessionUpdatedEvent = {
      session,
      previousSession,
      changes,
    };
    this.events.emit('sessionUpdated', event);
  }

  private detectRelationshipChanges(
    previousSession: GameSessionDTO,
    currentSession: GameSessionDTO
  ): void {
    // Get all NPC IDs that might have relationship changes
    const npcIds = new Set<number>();

    // Check stats.relationships if it exists
    if (currentSession.stats?.relationships) {
      Object.keys(currentSession.stats.relationships).forEach((key) => {
        const match = key.match(/^npc:(\d+)$/);
        if (match) {
          npcIds.add(parseInt(match[1], 10));
        }
      });
    }

    // Check each NPC for relationship changes
    npcIds.forEach((npcId) => {
      const oldState = getNpcRelationshipState(previousSession, npcId);
      const newState = getNpcRelationshipState(currentSession, npcId);

      // Check if relationship changed
      if (this.hasRelationshipChanged(oldState, newState)) {
        this.relationshipCache.set(npcId, newState!);

        // Emit event
        const event: NpcRelationshipChangedEvent = {
          npcId,
          oldState,
          newState: newState!,
        };
        this.events.emit('npcRelationshipChanged', event);

        // Run plugin hooks
        this.runPluginHook('onRelationshipChanged', npcId, oldState, newState!);

        this.log(`Relationship changed for NPC ${npcId}`);
      }
    });
  }

  private hasRelationshipChanged(
    oldState: NpcRelationshipState | null,
    newState: NpcRelationshipState | null
  ): boolean {
    if (!oldState && newState) return true;
    if (oldState && !newState) return true;
    if (!oldState && !newState) return false;

    return (
      oldState!.values.affinity !== newState!.values.affinity ||
      oldState!.values.trust !== newState!.values.trust ||
      oldState!.values.chemistry !== newState!.values.chemistry ||
      oldState!.values.tension !== newState!.values.tension ||
      oldState!.tierId !== newState!.tierId ||
      oldState!.levelId !== newState!.levelId ||
      JSON.stringify(oldState!.flags) !== JSON.stringify(newState!.flags)
    );
  }

  private async runPluginHook<K extends keyof import('./types').GameRuntimePlugin>(
    hookName: K,
    ...args: any[]
  ): Promise<any> {
    if (!this.config.plugins || this.config.plugins.length === 0) {
      return undefined;
    }

    for (const plugin of this.config.plugins) {
      const hook = plugin[hookName] as any;
      if (typeof hook === 'function') {
        try {
          const result = await hook.apply(plugin, args);
          // For beforeInteraction, if any plugin returns false, block the interaction
          if (hookName === 'beforeInteraction' && result === false) {
            return false;
          }
        } catch (error) {
          console.error(`Error in plugin ${plugin.id} hook ${String(hookName)}:`, error);
        }
      }
    }

    return undefined;
  }
}

/**
 * Factory function to create a GameRuntime instance
 */
export function createGameRuntime(config: GameRuntimeConfig): IGameRuntime {
  return new GameRuntime(config);
}
