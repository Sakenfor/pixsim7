import type { GameSessionDTO } from '@pixsim7/types';
import type { NpcBrainState, NpcRelationshipState } from '../core/types';

/**
 * NPC persona data structure (matches GameNPC.personality schema)
 */
export interface NpcPersona {
  traits?: Record<string, number>;
  tags?: string[];
  conversation_style?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Merged persona result with normalized fields
 */
interface MergedPersona {
  traits: Record<string, number>;
  tags: string[];
  conversation_style?: string;
}

/**
 * Merge base NPC persona with session-specific overrides
 *
 * Follows backend's merge_npc_persona convention:
 * - Base: persona parameter (from GameNPC.personality)
 * - Overrides: session.flags.npcs["npc:ID"]
 * - Session can override personality.traits, personality.tags, conversation_style, etc.
 *
 * @param basePersona - Base persona data (from GameNPC.personality or null)
 * @param npcId - NPC ID for session lookup
 * @param session - Game session with potential overrides in flags
 * @returns Merged persona with traits, tags, and conversation_style
 */
function mergeNpcPersona(
  basePersona: NpcPersona | undefined,
  npcId: number,
  session: GameSessionDTO
): MergedPersona {
  // Start with base persona or empty defaults
  const base = basePersona || {};
  const baseTraits = base.traits || {};
  const baseTags = base.tags || [];
  const baseConversationStyle = base.conversation_style;

  // Extract session overrides from flags.npcs["npc:ID"]
  const flags = session.flags as any;
  const npcOverrides = flags?.npcs?.[`npc:${npcId}`];

  if (!npcOverrides || typeof npcOverrides !== 'object') {
    // No overrides, return base with defaults
    return {
      traits: Object.keys(baseTraits).length > 0 ? baseTraits : getDefaultTraits(),
      tags: baseTags.length > 0 ? baseTags : getDefaultTags(),
      conversation_style: baseConversationStyle,
    };
  }

  // Merge traits (session overrides win)
  let mergedTraits = { ...baseTraits };
  if (npcOverrides.personality?.traits && typeof npcOverrides.personality.traits === 'object') {
    mergedTraits = { ...mergedTraits, ...npcOverrides.personality.traits };
  } else if (npcOverrides.traits && typeof npcOverrides.traits === 'object') {
    // Also support direct .traits key for convenience
    mergedTraits = { ...mergedTraits, ...npcOverrides.traits };
  }

  // Merge tags (combine and deduplicate)
  let mergedTags = [...baseTags];
  if (npcOverrides.personality?.tags && Array.isArray(npcOverrides.personality.tags)) {
    mergedTags = [...new Set([...mergedTags, ...npcOverrides.personality.tags])];
  } else if (npcOverrides.personaTags && Array.isArray(npcOverrides.personaTags)) {
    // Support legacy personaTags key
    mergedTags = [...new Set([...mergedTags, ...npcOverrides.personaTags])];
  } else if (npcOverrides.tags && Array.isArray(npcOverrides.tags)) {
    // Also support direct .tags key
    mergedTags = [...new Set([...mergedTags, ...npcOverrides.tags])];
  }

  // Override conversation_style if provided
  let conversationStyle = baseConversationStyle;
  if (npcOverrides.personality?.conversation_style) {
    conversationStyle = npcOverrides.personality.conversation_style;
  } else if (npcOverrides.conversationStyle) {
    conversationStyle = npcOverrides.conversationStyle;
  } else if (npcOverrides.conversation_style) {
    conversationStyle = npcOverrides.conversation_style;
  }

  // Use defaults if still empty
  if (Object.keys(mergedTraits).length === 0) {
    mergedTraits = getDefaultTraits();
  }
  if (mergedTags.length === 0) {
    mergedTags = getDefaultTags();
  }

  return {
    traits: mergedTraits,
    tags: mergedTags,
    conversation_style: conversationStyle,
  };
}

/**
 * Default personality traits (Big Five model, 0-100 scale)
 */
function getDefaultTraits(): Record<string, number> {
  return {
    openness: 50,
    conscientiousness: 50,
    extraversion: 50,
    agreeableness: 50,
    neuroticism: 50,
  };
}

/**
 * Default persona tags
 */
function getDefaultTags(): string[] {
  return ['friendly', 'curious'];
}

/**
 * Build NPC brain state from session data and relationship state
 *
 * This implementation combines:
 * - Base NPC persona (from GameNPC.personality or other sources)
 * - Per-session overrides from GameSession.flags.npcs["npc:ID"]
 * - Relationship state (affinity, trust, chemistry, tension, flags)
 * - Derived mood based on relationship values
 *
 * Merging follows backend's merge_npc_persona convention:
 * - Base traits/tags/conversation_style from persona parameter
 * - Session overrides from flags.npcs["npc:ID"].personality
 * - Session-level traits/tags can override or extend base values
 *
 * @param params - NPC ID, session, relationship state, and optional persona
 * @returns Complete NPC brain state
 */
export function buildNpcBrainState(params: {
  npcId: number;
  session: GameSessionDTO;
  relationship: NpcRelationshipState;
  persona?: NpcPersona;
}): NpcBrainState {
  const { npcId, session, relationship, persona } = params;

  // Merge base persona with session overrides
  const mergedPersona = mergeNpcPersona(persona, npcId, session);

  // Extract traits, tags, and conversation style from merged persona
  const traits = mergedPersona.traits;
  const personaTags = mergedPersona.tags;
  const conversationStyle = mergedPersona.conversation_style;

  // Extract memories from session
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
    conversationStyle: conversationStyle || deriveConversationStyle(traits, relationship),
    memories,
    mood,
    logic,
    instincts,
    social,
  };
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
