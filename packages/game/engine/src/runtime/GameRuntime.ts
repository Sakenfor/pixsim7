/**
 * GameRuntime implementation
 *
 * Core runtime that owns the client-side view of GameSessionDTO + GameWorldDetail
 * and provides methods to load/save sessions, apply interactions, and advance world time.
 */

import type {
  EntityRef,
  GameSessionDTO,
  GameWorldDetail,
  ExecuteInteractionResponse,
  InteractionParticipant,
  InteractionTarget,
  TemplateKind,
  SessionFlags,
} from '@pixsim7/shared.types';
import { Ref } from '@pixsim7/shared.ref.core';
import { createTemplateRefKey } from '@pixsim7/core.links';
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
  EnsureSessionOptions,
  AdvanceTimeOptions,
  TickCompletedEvent,
} from './types';
import type { GameTickContext, GameEvent } from '../plugins/types';
import type { NpcRelationshipState } from '../core/types';
import {
  getAdapterBySource,
  type StatSource,
} from '../session/statAdapters';
import { getNpcRelationshipState } from '../session/state';
import {
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  createTurnAdvanceFlags,
} from '../world/turnHelpers';
import { loadWorldSession, saveWorldSession } from '../session/storage';

type TemplateResolution = {
  runtimeId: number | null;
  runtimeKind?: string;
};

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

  // Cache for template->runtime resolution (keyed by "templateKind:templateId")
  private templateCache = new Map<string, TemplateResolution>();

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
   * @returns Resolution info with runtimeId (null if no active link found)
   */
  async resolveTemplateToRuntime(
    templateKind: TemplateKind,
    templateId: string
  ): Promise<TemplateResolution> {
    const cacheKey = createTemplateRefKey(templateKind, templateId);

    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey) ?? { runtimeId: null };
    }

    // Check if API client supports template resolution
    if (!this.config.apiClient.resolveTemplate) {
      this.log(`API client does not support resolveTemplate, cannot resolve ${cacheKey}`);
      return { runtimeId: null };
    }

    try {
      // Build context from current game state
      const context = this.buildResolutionContext();

      const result = await this.config.apiClient.resolveTemplate(
        templateKind,
        templateId,
        context
      );

      const resolution: TemplateResolution = {
        runtimeId: result.resolved ? (result.runtimeId ?? null) : null,
        runtimeKind: result.runtimeKind,
      };

      // Cache the result
      this.templateCache.set(cacheKey, resolution);

      this.log(
        `Resolved ${cacheKey} -> ${resolution.runtimeId !== null ? `runtime:${resolution.runtimeId}` : 'not found'}`
      );

      return resolution;
    } catch (error) {
      this.log(`Failed to resolve ${cacheKey}: ${error}`);
      // Cache the failure to avoid repeated API calls
      const resolution = { runtimeId: null };
      this.templateCache.set(cacheKey, resolution);
      return resolution;
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

  private buildParticipantsFromIntent(
    intent: InteractionIntent
  ): { participants: InteractionParticipant[]; primaryRole: string } {
    let participants = [...(intent.participants ?? [])];
    let primaryRole = intent.primaryRole;

    if (intent.target) {
      const role = primaryRole ?? 'target';
      const existing = participants.find((participant) => participant.role === role);
      if (existing) {
        const refMismatch =
          existing.ref && intent.target.ref && existing.ref !== intent.target.ref;
        const kindMismatch =
          existing.kind && intent.target.kind && existing.kind !== intent.target.kind;
        const idMismatch =
          existing.id != null &&
          intent.target.id != null &&
          existing.id !== intent.target.id;
        const templateKindMismatch =
          existing.templateKind &&
          intent.target.templateKind &&
          existing.templateKind !== intent.target.templateKind;
        const templateIdMismatch =
          existing.templateId &&
          intent.target.templateId &&
          existing.templateId !== intent.target.templateId;
        const linkIdMismatch =
          existing.linkId &&
          intent.target.linkId &&
          existing.linkId !== intent.target.linkId;
        const mismatch =
          refMismatch ||
          kindMismatch ||
          idMismatch ||
          templateKindMismatch ||
          templateIdMismatch ||
          linkIdMismatch;
        if (mismatch) {
          throw new Error(`Participant role "${role}" conflicts with target payload`);
        }
      } else {
        participants.push({ role, ...intent.target });
      }
      primaryRole = role;
    }

    participants = participants.map((participant) => this.normalizeParticipantRef(participant));

    if (participants.length === 0) {
      throw new Error('InteractionIntent requires target or participants');
    }

    if (!primaryRole) {
      primaryRole = participants[0].role;
    }

    const seen = new Set<string>();
    for (const participant of participants) {
      if (seen.has(participant.role)) {
        throw new Error(`Duplicate participant role "${participant.role}"`);
      }
      seen.add(participant.role);
    }

    if (!seen.has(primaryRole)) {
      throw new Error(`primaryRole "${primaryRole}" not found in participants`);
    }

    for (const participant of participants) {
      if (
        !participant.ref &&
        participant.id == null &&
        (!participant.templateKind || !participant.templateId)
      ) {
        throw new Error(`Participant "${participant.role}" requires id or template reference`);
      }
    }

    return { participants, primaryRole };
  }

  private getPrimaryParticipant(
    participants: InteractionParticipant[],
    primaryRole: string
  ): InteractionParticipant {
    return (
      participants.find((participant) => participant.role === primaryRole) ??
      participants[0]
    );
  }

  private participantToTarget(participant: InteractionParticipant): InteractionTarget {
    const { role, ...target } = participant;
    return target;
  }

  private normalizeParticipantRef(
    participant: InteractionParticipant
  ): InteractionParticipant {
    let normalized = participant;
    if (participant.ref) {
      const parsed = this.parseEntityRef(participant.ref);
      if (parsed) {
        normalized = {
          ...normalized,
          kind: normalized.kind ?? parsed.kind,
          id: normalized.id ?? parsed.id,
        };
        if (typeof parsed.id !== 'number') {
          normalized = { ...normalized, ref: undefined };
        }
      }
    }

    if (!normalized.ref) {
      const ref = this.buildEntityRef(normalized.kind, normalized.id);
      if (ref) {
        normalized = { ...normalized, ref };
      }
    }

    return normalized;
  }

  private parseEntityRef(
    ref: string
  ): { kind: string; id: number | string } | null {
    if (!ref.includes(':')) return null;
    const parts = ref.split(':');
    if (parts.length < 2) return null;
    const kind = parts[0];
    const rawId = parts[parts.length - 1];
    if (!rawId) return null;
    const numeric = Number(rawId);
    const id = Number.isFinite(numeric) ? numeric : rawId;
    return { kind, id };
  }

  private buildEntityRef(
    kind?: string,
    id?: number | string
  ): EntityRef | undefined {
    if (!kind || id == null) return undefined;
    const numeric = typeof id === 'number' ? id : Number(id);
    const hasNumber = Number.isFinite(numeric);
    if (!hasNumber) return undefined;

    switch (kind) {
      case 'npc':
        return Ref.npc(numeric);
      case 'location':
        return Ref.location(numeric);
      case 'scene':
        return Ref.scene(numeric);
      case 'asset':
        return Ref.asset(numeric);
      case 'generation':
        return Ref.generation(numeric);
      case 'world':
        return Ref.world(numeric);
      case 'session':
        return Ref.session(numeric);
      default:
        return `${kind}:${numeric}` as EntityRef;
    }
  }

  private async resolveParticipants(
    participants: InteractionParticipant[]
  ): Promise<InteractionParticipant[]> {
    const normalized = participants.map((participant) => this.normalizeParticipantRef(participant));
    const unresolved = normalized.filter(
      (participant) =>
        participant.id == null && participant.templateKind && participant.templateId
    );

    if (unresolved.length === 0) {
      return normalized;
    }

    const context = this.buildResolutionContext();

    if (this.config.apiClient.resolveTemplateBatch && unresolved.length > 1) {
      const refs = unresolved.map((participant) => ({
        templateKind: participant.templateKind as TemplateKind,
        templateId: participant.templateId!,
      }));

      const result = await this.config.apiClient.resolveTemplateBatch(refs, context);

      return normalized.map((participant) => {
        if (participant.id != null || !participant.templateKind || !participant.templateId) {
          return participant;
        }

        const key = createTemplateRefKey(participant.templateKind, participant.templateId);
        const resolved = result.results[key];
        if (!resolved?.resolved || resolved.runtimeId == null) {
          throw new Error(
            `Failed to resolve ${participant.templateKind}:${participant.templateId} to runtime entity`
          );
        }

        const resolvedParticipant = {
          ...participant,
          id: resolved.runtimeId,
          kind: resolved.runtimeKind ?? participant.kind,
        };
        return this.normalizeParticipantRef(resolvedParticipant);
      });
    }

    const resolvedParticipants: InteractionParticipant[] = [];
    for (const participant of normalized) {
      if (participant.id != null || !participant.templateKind || !participant.templateId) {
        resolvedParticipants.push(participant);
        continue;
      }

      const resolution = await this.resolveTemplateToRuntime(
        participant.templateKind as TemplateKind,
        participant.templateId
      );

      if (resolution.runtimeId === null) {
        throw new Error(
          `Failed to resolve ${participant.templateKind}:${participant.templateId} to runtime entity`
        );
      }

      resolvedParticipants.push(this.normalizeParticipantRef({
        ...participant,
        id: resolution.runtimeId,
        kind: resolution.runtimeKind ?? participant.kind,
      }));
    }

    return resolvedParticipants;
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

      // Preserve existing world unless/until we can reliably infer world_id from session.
      // This prevents ensureSessionForWorld() from losing the already-loaded world state
      // when it restores an existing session.
      let world: GameWorldDetail | null = this.world;
      if (loadWorld) {
        // For now, skip world loading as GameSessionDTO doesn't expose world_id.
        // Keep current world in memory if one is already available.
      }

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
   * Supports direct targeting or template-based targeting resolved via ObjectLink.
   */
  async applyInteraction(intent: InteractionIntent): Promise<ExecuteInteractionResponse> {
    this.checkDisposed();

    if (!this.session) {
      throw new Error('No session loaded');
    }

    const { participants, primaryRole } = this.buildParticipantsFromIntent(intent);

    let resolvedParticipants: InteractionParticipant[];
    try {
      resolvedParticipants = await this.resolveParticipants(participants);
    } catch (error) {
      const message = (error as Error).message ?? 'Failed to resolve interaction participants';
      this.log(message);
      return {
        success: false,
        message,
        timestamp: Date.now(),
      };
    }

    const primaryParticipant = this.getPrimaryParticipant(resolvedParticipants, primaryRole);
    const target = this.participantToTarget(primaryParticipant);
    const resolvedIntent: InteractionIntent = {
      ...intent,
      target,
      participants: resolvedParticipants,
      primaryRole,
    };

    const targetRef = target.ref ?? (target.kind && target.id != null ? `${target.kind}:${target.id}` : 'unknown');
    this.log(
      `Applying interaction: ${resolvedIntent.interactionId} with ${targetRef}`
    );

    try {
      // Run before hooks (can cancel interaction)
      const allowed = await this.runPluginHook('beforeInteraction', resolvedIntent, this.session);
      if (allowed === false) {
        this.log(`Interaction ${resolvedIntent.interactionId} was blocked by a plugin`);
        return {
          success: false,
          message: 'Interaction blocked by plugin',
          timestamp: Date.now(),
        };
      }

      // Execute interaction via API
      const response = await this.config.apiClient.executeInteraction({
        worldId: resolvedIntent.worldId,
        sessionId: resolvedIntent.sessionId,
        target,
        participants: resolvedParticipants,
        primaryRole,
        interactionId: resolvedIntent.interactionId,
        playerInput: resolvedIntent.playerInput,
        context: resolvedIntent.context,
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
      await this.runPluginHook('afterInteraction', resolvedIntent, response, this.session);

      // Emit interaction executed event
      const event: InteractionExecutedEvent = {
        intent: resolvedIntent,
        response,
        success: response.success,
      };
      this.events.emit('interactionExecuted', event);

      this.log(
        `Interaction ${resolvedIntent.interactionId} completed: ${response.success ? 'success' : 'failure'}`
      );
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

  // ============================================
  // Orchestration Methods (tick lifecycle + session ensure)
  // ============================================

  /**
   * Ensure a session exists for a world.
   * Loads world, checks storage for existing session, creates if needed.
   */
  async ensureSessionForWorld(
    worldId: number,
    options: EnsureSessionOptions = {}
  ): Promise<GameSessionDTO> {
    this.checkDisposed();
    this.log(`Ensuring session for world ${worldId}...`);

    try {
      // Load world
      const world = await this.config.apiClient.getWorld(worldId);
      this.world = world;

      // Check storage for existing session
      const stored = loadWorldSession();
      if (stored?.gameSessionId && stored.worldId === worldId) {
        try {
          await this.loadSession(stored.gameSessionId, false);
          const existing = this.getSession();
          if (existing) {
            // loadSession() does not infer world from session yet; retain the already loaded world.
            this.world = world;
            this.log(`Restored existing session ${existing.id} for world ${worldId}`);
            return existing as GameSessionDTO;
          }
        } catch {
          // Session no longer valid, create new
          this.log('Stored session invalid, creating new');
        }
      }

      // Build session flags
      const sessionKind =
        options.sessionKind === 'simulation' ? 'scene' : options.sessionKind ?? 'world';
      const worldMode = options.worldMode ?? (isTurnBasedMode(null, world) ? 'turn_based' : 'real_time');

      const flags: Record<string, unknown> = {
        sessionKind,
        world: {
          id: String(worldId),
          mode: worldMode,
          currentLocationId: options.initialLocationId,
          turnDeltaSeconds: options.turnDeltaSeconds,
          turnNumber: 0,
        },
        ...options.initialFlags,
      };

      const sceneId = this.resolveSceneIdForNewSession(world, options);

      // Create new session
      const newSession = await this.config.apiClient.createSession(sceneId, flags);
      this.session = newSession;

      // Sync world_time if needed
      if (newSession.world_time !== world.world_time) {
        const synced = await this.config.apiClient.updateSession(newSession.id, {
          world_time: world.world_time,
        });
        this.session = synced;
      }

      // Persist
      saveWorldSession({
        worldTimeSeconds: world.world_time,
        gameSessionId: this.session.id,
        worldId,
      });

      // Emit session loaded event
      this.events.emit('sessionLoaded', {
        session: this.session,
        world: this.world,
      });

      this.log(`Created session ${this.session.id} for world ${worldId}`);
      return this.session;
    } catch (error) {
      this.emitError(error as Error, 'ensureSessionForWorld');
      throw error;
    }
  }

  private resolveSceneIdForNewSession(
    world: GameWorldDetail,
    options: EnsureSessionOptions
  ): number {
    const toPositiveInt = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return Math.floor(parsed);
        }
      }
      return null;
    };

    const explicit = toPositiveInt(options.sceneId);
    if (explicit !== null) return explicit;

    const flagsSceneId = toPositiveInt(
      options.initialFlags?.['sceneId'] ?? options.initialFlags?.['scene_id']
    );
    if (flagsSceneId !== null) return flagsSceneId;

    const meta = world.meta as Record<string, unknown> | null | undefined;
    if (meta) {
      const metaCandidates = [
        'defaultSceneId',
        'default_scene_id',
        'startSceneId',
        'start_scene_id',
        'sceneId',
        'scene_id',
      ];
      for (const key of metaCandidates) {
        const value = toPositiveInt(meta[key]);
        if (value !== null) {
          return value;
        }
      }
    }

    this.log(
      `No sceneId provided/inferred for world ${world.id}; using fallback sceneId=1`
    );
    return 1;
  }

  /**
   * Advance world time with full plugin hook lifecycle.
   * Runs beforeTick → advanceWorldTime → sync session → onTick → afterTick.
   */
  async advanceTimeWithHooks(
    deltaSeconds: number,
    options: AdvanceTimeOptions = {}
  ): Promise<GameEvent[]> {
    this.checkDisposed();

    if (!this.world) {
      throw new Error('No world loaded');
    }

    this.log(`Advancing time by ${deltaSeconds}s with hooks`);

    try {
      const previousTime = this.world.world_time ?? 0;
      const predictedNewTime = previousTime + deltaSeconds;
      const registry = this.config.pluginRegistry;

      // Build tick context
      const tickContext = this.buildTickContext(deltaSeconds, predictedNewTime, options);

      // Run beforeTick hooks
      if (registry && !options.skipHooks) {
        await registry.runBeforeTick(tickContext);
      }

      // Advance world time via API (updates this.world internally)
      await this.advanceWorldTime(deltaSeconds);

      // Sync session world_time
      if (this.session) {
        const updated = await this.config.apiClient.updateSession(this.session.id, {
          world_time: this.world!.world_time,
        });
        const previousSession = this.session;
        this.session = updated;
        this.emitSessionUpdated(previousSession, this.session, { worldTime: true });
      }

      // Persist
      saveWorldSession({
        worldTimeSeconds: this.world!.world_time,
        gameSessionId: this.session?.id,
        worldId: this.world!.id,
      });

      // Run onTick + afterTick hooks
      let events: GameEvent[] = [];
      if (registry && !options.skipHooks) {
        const finalContext = this.buildTickContext(deltaSeconds, this.world!.world_time, options);
        events = await registry.runOnTick(finalContext);
        await registry.runAfterTick(finalContext, events);
      }

      // Emit tickCompleted event
      const tickEvent: TickCompletedEvent = {
        deltaSeconds,
        previousTime,
        newTime: this.world!.world_time,
        events,
      };
      this.events.emit('tickCompleted', tickEvent);

      return events;
    } catch (error) {
      this.emitError(error as Error, 'advanceTimeWithHooks');
      throw error;
    }
  }

  /**
   * Advance one turn with full plugin hook lifecycle (turn-based mode).
   * Calculates delta from session/world config, runs full hook lifecycle,
   * and updates turn number in session flags.
   */
  async advanceTurnWithHooks(
    options: AdvanceTimeOptions = {}
  ): Promise<GameEvent[]> {
    this.checkDisposed();

    if (!this.world) {
      throw new Error('No world loaded');
    }

    const delta = getTurnDelta(this.session?.flags as Record<string, unknown> | undefined, this.world);
    this.log(`Advancing turn by ${delta}s with hooks`);

    try {
      const previousTime = this.world.world_time ?? 0;
      const predictedNewTime = previousTime + delta;
      const registry = this.config.pluginRegistry;

      // Build tick context
      const tickContext = this.buildTickContext(delta, predictedNewTime, options);

      // Run beforeTick hooks
      if (registry && !options.skipHooks) {
        await registry.runBeforeTick(tickContext);
      }

      // Advance world time via API (updates this.world internally)
      await this.advanceWorldTime(delta);

      // Update session with new world_time and turn flags
      if (this.session && isTurnBasedMode(this.session.flags as Record<string, unknown>, this.world)) {
        const updatedFlags = createTurnAdvanceFlags(
          this.session.flags as SessionFlags,
          this.world!.world_time,
          options.locationId
        );

        const updated = await this.config.apiClient.updateSession(this.session.id, {
          world_time: this.world!.world_time,
          flags: updatedFlags,
        });
        const previousSession = this.session;
        this.session = updated;
        this.emitSessionUpdated(previousSession, this.session, { worldTime: true, flags: true });
      } else if (this.session) {
        // Real-time mode: just update world_time
        const updated = await this.config.apiClient.updateSession(this.session.id, {
          world_time: this.world!.world_time,
        });
        const previousSession = this.session;
        this.session = updated;
        this.emitSessionUpdated(previousSession, this.session, { worldTime: true });
      }

      // Persist
      saveWorldSession({
        worldTimeSeconds: this.world!.world_time,
        gameSessionId: this.session?.id,
        worldId: this.world!.id,
      });

      // Run onTick + afterTick hooks
      let events: GameEvent[] = [];
      if (registry && !options.skipHooks) {
        const finalContext: GameTickContext = {
          ...this.buildTickContext(delta, this.world!.world_time, options),
          turnNumber: getCurrentTurnNumber(this.session?.flags as Record<string, unknown> | undefined),
        };
        events = await registry.runOnTick(finalContext);
        await registry.runAfterTick(finalContext, events);
      }

      // Emit tickCompleted event
      const tickEvent: TickCompletedEvent = {
        deltaSeconds: delta,
        previousTime,
        newTime: this.world!.world_time,
        events,
        turnNumber: getCurrentTurnNumber(this.session?.flags as Record<string, unknown> | undefined),
      };
      this.events.emit('tickCompleted', tickEvent);

      return events;
    } catch (error) {
      this.emitError(error as Error, 'advanceTurnWithHooks');
      throw error;
    }
  }

  /**
   * Build a GameTickContext for plugin hooks
   */
  private buildTickContext(
    deltaSeconds: number,
    worldTimeSeconds: number,
    options: AdvanceTimeOptions = {}
  ): GameTickContext {
    return {
      worldId: this.world!.id,
      world: this.world!,
      worldTimeSeconds,
      deltaSeconds,
      session: this.session,
      locationId: options.locationId ?? null,
      isTurnBased: isTurnBasedMode(
        this.session?.flags as Record<string, unknown> | undefined,
        this.world
      ),
      turnNumber: getCurrentTurnNumber(
        this.session?.flags as Record<string, unknown> | undefined
      ),
      origin: options.origin ?? 'game',
      simulationContext: options.simulationContext,
    };
  }

  /**
   * Get stat data using the stat adapter registry.
   */
  getStat(source: StatSource, entityId?: number): unknown | null {
    if (!this.session) return null;

    const adapter = getAdapterBySource(source);
    if (!adapter) {
      this.log(`No adapter registered for source "${source}"`);
      return null;
    }

    return adapter.get(this.session, entityId);
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
