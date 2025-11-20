import type { GameSessionDTO, UnifiedMoodState } from '@pixsim7/shared.types';
import type { NpcBrainState, NpcRelationshipState } from '../core/types';

/**
 * NPC persona data structure
 *
 * Matches the schema of GameNPC.personality in the backend database.
 * This data typically comes from:
 * - Backend API when fetching NPC data
 * - GameNPC.personality field (JSON column)
 * - NpcPersonaProvider when configured in PixSim7CoreConfig
 *
 * @property traits - Personality traits (e.g., Big Five model: openness, conscientiousness, etc.)
 * @property tags - Descriptive tags (e.g., "playful", "romantic", "adventurous")
 * @property conversation_style - How NPC speaks (e.g., "warm", "distant", "playful")
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
 * Build comprehensive NPC brain state projection
 *
 * Constructs a complete NPC brain state by merging multiple data sources:
 *
 * **Data Sources:**
 * 1. Base persona (optional): From GameNPC.personality in backend database
 * 2. Session overrides: From GameSession.flags.npcs["npc:ID"]
 * 3. Relationship state: From GameSession.relationships["npc:ID"]
 * 4. Unified mood (optional): Pre-computed unified mood state from backend
 *
 * **Merging Logic (follows backend's merge_npc_persona):**
 * - Base traits/tags/conversation_style from `persona` parameter
 * - Session overrides from `flags.npcs["npc:ID"].personality`
 * - Session-level overrides win over base values
 * - Tags are combined and deduplicated
 *
 * **Backend Relationship:**
 * - Relationship tierId and intimacyLevelId should be backend-computed (authoritative)
 * - Mood is derived from unified mood system when available (preferred)
 * - Falls back to local computation from relationship axes when unified mood unavailable
 * - Social state includes backend-computed tier/intimacy when available
 *
 * **Unified Mood Integration:**
 * - When `unifiedMood` is provided, it drives the brain's mood component
 * - Includes general mood (valence/arousal), optional intimacy mood, and optional active emotion
 * - When unavailable, falls back to local valence/arousal computation for offline/preview tools
 *
 * **No Schema Changes:**
 * All data comes from existing JSON fields (GameNPC.personality, GameSession.flags,
 * GameSession.relationships). No new database columns required.
 *
 * @param params.npcId - NPC ID to build brain state for
 * @param params.session - Game session with flags and relationships
 * @param params.relationship - Pre-extracted relationship state for this NPC
 * @param params.persona - Optional base persona from GameNPC.personality
 * @param params.unifiedMood - Optional pre-computed unified mood state from backend
 * @returns Complete NPC brain state with traits, mood, social, and memories
 *
 * @example
 * ```ts
 * const persona: NpcPersona = {
 *   traits: { openness: 75, extraversion: 80 },
 *   tags: ['playful', 'romantic'],
 *   conversation_style: 'warm'
 * };
 *
 * const relationship = getNpcRelationshipState(session, 12);
 *
 * // With unified mood (preferred)
 * const unifiedMood = await previewUnifiedMood({ worldId: 1, npcId: 12, sessionId: session.id });
 * const brain = buildNpcBrainState({
 *   npcId: 12,
 *   session,
 *   relationship,
 *   persona,
 *   unifiedMood
 * });
 *
 * console.log(brain.mood.label); // e.g., "excited"
 * console.log(brain.mood.intimacyMood?.moodId); // e.g., "passionate"
 * console.log(brain.social.tierId); // e.g., "close_friend"
 * ```
 */
export function buildNpcBrainState(params: {
  npcId: number;
  session: GameSessionDTO;
  relationship: NpcRelationshipState;
  persona?: NpcPersona;
  unifiedMood?: UnifiedMoodState;
}): NpcBrainState {
  const { npcId, session, relationship, persona, unifiedMood } = params;

  // Merge base persona with session overrides
  const mergedPersona = mergeNpcPersona(persona, npcId, session);

  // Extract traits, tags, and conversation style from merged persona
  const traits = mergedPersona.traits;
  const personaTags = mergedPersona.tags;
  const conversationStyle = mergedPersona.conversation_style;

  // Extract memories from session
  const memories = extractMemoriesFromSession(npcId, session);

  // Compute mood based on unified mood system (preferred) or relationship state (fallback)
  const mood = computeMood(relationship, unifiedMood);

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
 * Compute mood based on unified mood system or relationship state fallback
 *
 * **Unified Mood (Preferred):**
 * When `unifiedMood` is provided, uses backend-computed mood state including:
 * - General mood (valence/arousal from backend evaluator)
 * - Optional intimacy mood based on relationship context
 * - Optional active discrete emotion
 *
 * **Fallback (Local Computation):**
 * When unified mood unavailable, computes locally from relationship state:
 * - Valence (pleasure): primarily driven by affinity and chemistry
 * - Arousal (energy): primarily driven by chemistry and tension
 *
 * @param relationship - Relationship state for fallback computation
 * @param unifiedMood - Optional pre-computed unified mood from backend
 * @returns Mood state with valence, arousal, label, and optional intimacy/emotion
 */
function computeMood(
  relationship: NpcRelationshipState,
  unifiedMood?: UnifiedMoodState
): {
  valence: number;
  arousal: number;
  label?: string;
  intimacyMood?: {
    moodId: string;
    intensity: number;
  };
  activeEmotion?: {
    emotionType: string;
    intensity: number;
    trigger?: string;
    expiresAt?: string;
  };
} {
  // Use unified mood if available (preferred path)
  if (unifiedMood) {
    return {
      valence: unifiedMood.generalMood.valence,
      arousal: unifiedMood.generalMood.arousal,
      label: unifiedMood.generalMood.moodId,
      intimacyMood: unifiedMood.intimacyMood,
      activeEmotion: unifiedMood.activeEmotion,
    };
  }

  // Fallback: compute locally from relationship state
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
