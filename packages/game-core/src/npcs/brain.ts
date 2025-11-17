import type { GameSessionDTO } from '@pixsim7/types';
import type { NpcBrainState, NpcRelationshipState } from '../core/types';

/**
 * Build NPC brain state from session data and relationship state
 *
 * This is a first-pass implementation that combines:
 * - NPC personality data (would come from GameNPC.personality in a full implementation)
 * - Relationship state (affinity, trust, chemistry, tension, flags)
 * - Derived mood based on relationship values
 *
 * @param params - NPC ID, session, and relationship state
 * @returns Complete NPC brain state
 */
export function buildNpcBrainState(params: {
  npcId: number;
  session: GameSessionDTO;
  relationship: NpcRelationshipState;
}): NpcBrainState {
  const { npcId, session, relationship } = params;

  // TODO: In a full implementation, fetch GameNPC data from backend or cache
  // For now, use placeholder personality data
  const traits = extractTraitsFromSession(npcId, session);
  const personaTags = extractPersonaTagsFromSession(npcId, session);
  const memories = extractMemoriesFromSession(npcId, session);

  // Compute mood based on relationship state
  const mood = computeMood(relationship);

  // Extract logic strategies (placeholder for now)
  const logic = {
    strategies: ['default'],
  };

  // Extract instincts (placeholder for now)
  const instincts = ['survive', 'socialize'];

  // Build social state from relationship
  const social = {
    affinity: relationship.affinity,
    trust: relationship.trust,
    chemistry: relationship.chemistry,
    tension: relationship.tension,
    tierId: relationship.tierId,
    intimacyLevelId: relationship.intimacyLevelId,
    flags: relationship.flags,
  };

  return {
    traits,
    personaTags,
    conversationStyle: deriveConversationStyle(traits, relationship),
    memories,
    mood,
    logic,
    instincts,
    social,
  };
}

/**
 * Extract NPC traits from session data
 * In the future, this would read from GameNPC.personality or world overrides
 */
function extractTraitsFromSession(
  npcId: number,
  session: GameSessionDTO
): Record<string, number> {
  // Check session flags for NPC-specific trait overrides
  const flags = session.flags as any;
  const npcTraits = flags?.npcs?.[`npc:${npcId}`]?.traits;

  if (npcTraits && typeof npcTraits === 'object') {
    return npcTraits;
  }

  // Default traits (placeholder)
  return {
    openness: 50,
    conscientiousness: 50,
    extraversion: 50,
    agreeableness: 50,
    neuroticism: 50,
  };
}

/**
 * Extract persona tags from session data
 */
function extractPersonaTagsFromSession(
  npcId: number,
  session: GameSessionDTO
): string[] {
  const flags = session.flags as any;
  const npcPersona = flags?.npcs?.[`npc:${npcId}`]?.personaTags;

  if (Array.isArray(npcPersona)) {
    return npcPersona;
  }

  // Default persona tags (placeholder)
  return ['friendly', 'curious'];
}

/**
 * Extract memories from session data
 */
function extractMemoriesFromSession(
  npcId: number,
  session: GameSessionDTO
): Array<{
  id: string;
  timestamp: string;
  summary: string;
  tags: string[];
  source?: 'scene' | 'event' | 'flag';
}> {
  const flags = session.flags as any;
  const npcMemories = flags?.npcs?.[`npc:${npcId}`]?.memories;

  if (Array.isArray(npcMemories)) {
    return npcMemories;
  }

  // No memories by default
  return [];
}

/**
 * Compute mood based on relationship state
 *
 * Valence (pleasure): primarily driven by affinity and chemistry
 * Arousal (energy): primarily driven by chemistry and tension
 */
function computeMood(relationship: NpcRelationshipState): {
  valence: number;
  arousal: number;
  label?: string;
} {
  const { affinity, chemistry, tension } = relationship;

  // Valence: positive emotions (0-100 scale)
  // High affinity and chemistry = positive valence
  const valence = (affinity * 0.6 + chemistry * 0.4);

  // Arousal: energy level (0-100 scale)
  // High chemistry or tension = high arousal
  const arousal = (chemistry * 0.5 + tension * 0.5);

  // Derive mood label from valence/arousal quadrants
  let label: string | undefined;
  if (valence >= 50 && arousal >= 50) {
    label = 'excited'; // High valence, high arousal
  } else if (valence >= 50 && arousal < 50) {
    label = 'content'; // High valence, low arousal
  } else if (valence < 50 && arousal >= 50) {
    label = 'anxious'; // Low valence, high arousal
  } else {
    label = 'calm'; // Low valence, low arousal
  }

  return { valence, arousal, label };
}

/**
 * Derive conversation style based on traits and relationship
 */
function deriveConversationStyle(
  traits: Record<string, number>,
  relationship: NpcRelationshipState
): string {
  const { affinity } = relationship;
  const extraversion = traits.extraversion || 50;
  const agreeableness = traits.agreeableness || 50;

  // Simple heuristic for conversation style
  if (affinity >= 60 && agreeableness >= 60) {
    return 'warm';
  } else if (affinity >= 40 && extraversion >= 60) {
    return 'friendly';
  } else if (affinity < 30) {
    return 'distant';
  } else {
    return 'neutral';
  }
}
