/**
 * useActorPresence Hook
 *
 * Unified hook for fetching actor presence (NPCs, players, agents) with
 * automatic refresh when world time or location changes.
 *
 * This extends the NPC presence pattern to support all actor types,
 * enabling multiplayer scenarios where players and NPCs coexist.
 *
 * Features:
 * - Fetches presence by actor type, world, location, and world time
 * - Supports filtering by actor type ('npc', 'player', 'agent', or 'all')
 * - Combines NPC presence API with player/agent state from session
 * - Debounces rapid changes to avoid excessive API calls
 * - Provides loading and error states
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getNpcPresence, type NpcPresenceDTO } from '../../api/game';
import type {
  ActorType,
  ActorPresence,
  AnyActor,
  NpcActor,
  PlayerActor,
  GameSessionDTO,
} from '@lib/registries';

export type ActorTypeFilter = ActorType | 'all';

export interface UseActorPresenceOptions {
  /** World ID to filter by */
  worldId?: number | null;
  /** Location ID to filter by (optional) */
  locationId?: number | null;
  /** World time in seconds to query at */
  worldTimeSeconds: number;
  /** Actor types to include (default: 'all') */
  actorTypes?: ActorTypeFilter | ActorTypeFilter[];
  /** Current session (for player/agent presence from session state) */
  session?: GameSessionDTO | null;
  /** Whether to fetch immediately or wait for explicit refresh */
  enabled?: boolean;
  /** Debounce delay in ms (default: 100) */
  debounceMs?: number;
}

export interface UseActorPresenceReturn {
  /** All actor presences (combined NPCs, players, agents) */
  actors: ActorPresence[];
  /** Just NPC presences */
  npcs: ActorPresence[];
  /** Just player presences */
  players: ActorPresence[];
  /** Just agent presences */
  agents: ActorPresence[];
  /** NPC presences in legacy DTO format (for functions expecting NpcPresenceDTO[]) */
  npcPresenceDTOs: NpcPresenceDTO[];
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
  /** Get actors at a specific location */
  getActorsAtLocation: (locationId: number) => ActorPresence[];
  /** Get actor by ID */
  getActorById: (actorId: number) => ActorPresence | undefined;
}

/**
 * Convert NpcPresenceDTO to ActorPresence
 */
function npcPresenceToActorPresence(
  npc: NpcPresenceDTO,
  worldTimeSeconds: number
): ActorPresence {
  return {
    actorId: npc.npc_id,
    actorType: 'npc',
    locationId: npc.location_id,
    worldTimeSeconds,
    state: npc.state,
  };
}

/**
 * Extract player actors from session state
 * Players are stored in session.flags.players or session.flags.actors
 */
function extractPlayersFromSession(
  session: GameSessionDTO | null | undefined,
  worldTimeSeconds: number
): ActorPresence[] {
  if (!session?.flags) return [];

  const players: ActorPresence[] = [];

  // Check for players in session flags
  const playersData = session.flags.players as Record<string, PlayerActor> | undefined;
  if (playersData) {
    for (const [key, player] of Object.entries(playersData)) {
      if (player && typeof player === 'object' && player.type === 'player') {
        players.push({
          actorId: player.id,
          actorType: 'player',
          locationId: player.locationId ?? 0,
          worldTimeSeconds,
          state: {
            name: player.name,
            controlledBy: player.controlledBy,
            ...player.flags,
          },
        });
      }
    }
  }

  // Also check for actors map (unified storage)
  const actorsData = session.flags.actors as Record<string, AnyActor> | undefined;
  if (actorsData) {
    for (const [key, actor] of Object.entries(actorsData)) {
      if (actor && typeof actor === 'object' && actor.type === 'player') {
        const playerActor = actor as PlayerActor;
        players.push({
          actorId: playerActor.id,
          actorType: 'player',
          locationId: playerActor.locationId ?? 0,
          worldTimeSeconds,
          state: {
            name: playerActor.name,
            controlledBy: playerActor.controlledBy,
            ...playerActor.flags,
          },
        });
      }
    }
  }

  return players;
}

/**
 * Extract agent actors from session state
 */
function extractAgentsFromSession(
  session: GameSessionDTO | null | undefined,
  worldTimeSeconds: number
): ActorPresence[] {
  if (!session?.flags) return [];

  const agents: ActorPresence[] = [];

  // Check for actors map (unified storage)
  const actorsData = session.flags.actors as Record<string, AnyActor> | undefined;
  if (actorsData) {
    for (const [key, actor] of Object.entries(actorsData)) {
      if (actor && typeof actor === 'object' && actor.type === 'agent') {
        agents.push({
          actorId: actor.id,
          actorType: 'agent',
          locationId: actor.locationId ?? 0,
          worldTimeSeconds,
          state: {
            name: actor.name,
            ...actor.flags,
          },
        });
      }
    }
  }

  return agents;
}

/**
 * Hook for fetching unified actor presence
 *
 * @example
 * // Fetch all actors at a location
 * const { actors, npcs, players } = useActorPresence({
 *   worldId: runtime.state.worldId,
 *   locationId: selectedLocationId,
 *   worldTimeSeconds: runtime.state.worldTimeSeconds,
 *   session: runtime.session,
 * });
 *
 * @example
 * // Fetch only NPCs (backward compatible with useNpcPresence)
 * const { npcs } = useActorPresence({
 *   worldId: selectedWorldId,
 *   worldTimeSeconds: worldTime,
 *   actorTypes: 'npc',
 * });
 *
 * @example
 * // Fetch players and NPCs for multiplayer
 * const { actors } = useActorPresence({
 *   worldId: worldId,
 *   worldTimeSeconds: worldTime,
 *   actorTypes: ['npc', 'player'],
 *   session: gameSession,
 * });
 */
export function useActorPresence(options: UseActorPresenceOptions): UseActorPresenceReturn {
  const {
    worldId,
    locationId,
    worldTimeSeconds,
    actorTypes = 'all',
    session,
    enabled = true,
    debounceMs = 100,
  } = options;

  // Normalize actor types to array
  const actorTypeList = useMemo(() => {
    if (actorTypes === 'all') return ['npc', 'player', 'agent'] as ActorType[];
    if (Array.isArray(actorTypes)) {
      return actorTypes.filter((t): t is ActorType => t !== 'all');
    }
    return [actorTypes] as ActorType[];
  }, [actorTypes]);

  const includeNpcs = actorTypeList.includes('npc');
  const includePlayers = actorTypeList.includes('player');
  const includeAgents = actorTypeList.includes('agent');

  const [npcPresences, setNpcPresences] = useState<ActorPresence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the last fetch params to avoid duplicate fetches
  const lastFetchRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch NPC presence from API
  const fetchNpcPresence = useCallback(async () => {
    if (!includeNpcs) {
      setNpcPresences([]);
      return;
    }

    // Build cache key from params
    const cacheKey = `npc-${worldId ?? 'null'}-${locationId ?? 'null'}-${worldTimeSeconds}`;

    // Skip if same params as last fetch
    if (cacheKey === lastFetchRef.current) {
      return;
    }

    // Clear presences if no world selected
    if (!worldId && !locationId) {
      setNpcPresences([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getNpcPresence({
        world_time: worldTimeSeconds,
        world_id: worldId ?? undefined,
        location_id: locationId ?? undefined,
      });

      const presences = result.map((npc) =>
        npcPresenceToActorPresence(npc, worldTimeSeconds)
      );

      setNpcPresences(presences);
      lastFetchRef.current = cacheKey;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useActorPresence] Failed to fetch NPC presence:', msg);
      setError(msg);
      setNpcPresences([]);
    } finally {
      setIsLoading(false);
    }
  }, [worldId, locationId, worldTimeSeconds, includeNpcs]);

  // Debounced fetch when dependencies change
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the fetch
    debounceTimerRef.current = setTimeout(() => {
      fetchNpcPresence();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, fetchNpcPresence, debounceMs]);

  // Extract player and agent presence from session (no API call needed)
  const playerPresences = useMemo(() => {
    if (!includePlayers) return [];
    return extractPlayersFromSession(session, worldTimeSeconds);
  }, [session, worldTimeSeconds, includePlayers]);

  const agentPresences = useMemo(() => {
    if (!includeAgents) return [];
    return extractAgentsFromSession(session, worldTimeSeconds);
  }, [session, worldTimeSeconds, includeAgents]);

  // Filter by location if specified
  const filterByLocation = useCallback(
    (presences: ActorPresence[]): ActorPresence[] => {
      if (locationId == null) return presences;
      return presences.filter((p) => p.locationId === locationId);
    },
    [locationId]
  );

  // Combined and filtered results
  const npcs = useMemo(
    () => filterByLocation(npcPresences),
    [npcPresences, filterByLocation]
  );

  const players = useMemo(
    () => filterByLocation(playerPresences),
    [playerPresences, filterByLocation]
  );

  const agents = useMemo(
    () => filterByLocation(agentPresences),
    [agentPresences, filterByLocation]
  );

  const actors = useMemo(
    () => [...npcs, ...players, ...agents],
    [npcs, players, agents]
  );

  // Convert NPC ActorPresence back to NpcPresenceDTO format for legacy APIs
  const npcPresenceDTOs = useMemo((): NpcPresenceDTO[] => {
    return npcs.map((p) => ({
      npc_id: p.actorId,
      location_id: p.locationId,
      state: p.state,
    }));
  }, [npcs]);

  // Utility: get actors at a specific location
  const getActorsAtLocation = useCallback(
    (locId: number): ActorPresence[] => {
      return actors.filter((a) => a.locationId === locId);
    },
    [actors]
  );

  // Utility: get actor by ID
  const getActorById = useCallback(
    (actorId: number): ActorPresence | undefined => {
      return actors.find((a) => a.actorId === actorId);
    },
    [actors]
  );

  // Refresh function
  const refresh = useCallback(async () => {
    lastFetchRef.current = null;
    await fetchNpcPresence();
  }, [fetchNpcPresence]);

  return {
    actors,
    npcs,
    players,
    agents,
    npcPresenceDTOs,
    isLoading,
    error,
    refresh,
    getActorsAtLocation,
    getActorById,
  };
}
