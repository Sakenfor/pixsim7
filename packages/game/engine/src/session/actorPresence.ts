/**
 * Actor Presence Utilities
 *
 * Pure functions for converting NPC presence DTOs and extracting
 * player/agent actors from session state. These are headless-safe
 * (no React, no browser APIs) so CLI tools and tests can use them.
 */

import type {
  ActorPresence,
  PlayerActor,
  AnyActor,
  GameSessionDTO,
} from '@pixsim7/shared.types';

/**
 * Minimal NPC presence input — structurally compatible with NpcPresenceDTO
 * without requiring a dependency on the API client package.
 */
export interface NpcPresenceInput {
  npc_id: number;
  location_id: number;
  state?: Record<string, unknown>;
}

/**
 * Convert an NPC presence record to a unified ActorPresence.
 */
export function npcPresenceToActorPresence(
  npc: NpcPresenceInput,
  worldTimeSeconds: number
): ActorPresence {
  return {
    actorId: npc.npc_id,
    actorType: 'npc',
    locationId: npc.location_id,
    worldTimeSeconds,
    state: npc.state ?? {},
  };
}

/**
 * Extract player actors from session flags.
 * Players are stored in session.flags.players or session.flags.actors.
 */
export function extractPlayersFromSession(
  session: Pick<GameSessionDTO, 'flags'> | null | undefined,
  worldTimeSeconds: number
): ActorPresence[] {
  if (!session?.flags) return [];

  const players: ActorPresence[] = [];

  // Check for players in session flags
  const playersData = session.flags.players as Record<string, PlayerActor> | undefined;
  if (playersData) {
    for (const [_key, player] of Object.entries(playersData)) {
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
    for (const [_key, actor] of Object.entries(actorsData)) {
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
 * Extract agent actors from session flags.
 * Agents are stored in session.flags.actors.
 */
export function extractAgentsFromSession(
  session: Pick<GameSessionDTO, 'flags'> | null | undefined,
  worldTimeSeconds: number
): ActorPresence[] {
  if (!session?.flags) return [];

  const agents: ActorPresence[] = [];

  // Check for actors map (unified storage)
  const actorsData = session.flags.actors as Record<string, AnyActor> | undefined;
  if (actorsData) {
    for (const [_key, actor] of Object.entries(actorsData)) {
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
