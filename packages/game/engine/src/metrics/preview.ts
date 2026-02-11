/**
 * Generic Metric Preview API Client
 *
 * Provides typed helpers for previewing any metric (relationships, mood, reputation, etc.)
 * using the backend metrics preview system.
 *
 * This module serves as the single point of interaction with the metrics preview API,
 * ensuring type safety and consistent error handling.
 */

import type {
  MetricId,
  MetricPreviewRequest,
  MetricPreviewResponse,
  NpcMoodPreviewRequest,
  NpcMoodPreviewResponse,
  ReputationBandPreviewRequest,
  ReputationBandPreviewResponse,
  UnifiedMoodState,
} from '@pixsim7/shared.types';

// ===================
// Configuration
// ===================

interface MetricPreviewConfig {
  baseUrl: string;
  /** Must be provided via configureMetricPreviewApi() before calling preview functions. */
  fetch: typeof fetch | null;
}

let config: MetricPreviewConfig = {
  baseUrl: '/api/v1',
  fetch: null,
};

function requireFetch(): typeof fetch {
  if (!config.fetch) {
    throw new Error(
      'MetricPreviewApi: fetch not configured. Call configureMetricPreviewApi({ fetch }) at startup.',
    );
  }
  return config.fetch;
}

/**
 * Configure the metric preview API client
 *
 * @param options - Configuration options
 * @example
 * ```ts
 * configureMetricPreviewApi({
 *   baseUrl: 'https://api.example.com/v1',
 *   fetch: customFetch
 * });
 * ```
 */
export function configureMetricPreviewApi(options: Partial<MetricPreviewConfig>): void {
  config = { ...config, ...options };
}

/**
 * Reset metric preview API configuration to defaults
 */
export function resetMetricPreviewApiConfig(): void {
  config = {
    baseUrl: '/api/v1',
    fetch: null,
  };
}

/**
 * Get current metric preview API configuration (for testing)
 */
export function getMetricPreviewApiConfig(): MetricPreviewConfig {
  return { ...config };
}

// ===================
// Generic Metric Preview
// ===================

/**
 * Preview any metric using the generic metrics preview system
 *
 * This is a low-level function. In most cases, you should use
 * the typed wrappers like `previewNpcMood` or `previewReputationBand`.
 *
 * @param args - Generic metric preview request
 * @returns Generic metric preview response
 * @throws Error if the request fails or returns an error response
 *
 * @example
 * ```ts
 * const result = await previewMetric({
 *   metric: 'npc_mood',
 *   worldId: 1,
 *   payload: { npc_id: 12, relationship_values: { ... } }
 * });
 * ```
 */
export async function previewMetric<M extends MetricId>(
  args: MetricPreviewRequest<M>
): Promise<MetricPreviewResponse<M>> {
  // This is a generic endpoint that could be implemented in the future
  // For now, we'll route to specific endpoints based on metric type
  throw new Error(
    'Generic metric preview endpoint not yet implemented. Use specific metric preview functions instead.'
  );
}

// ===================
// NPC Mood Preview
// ===================

/**
 * Preview NPC mood state based on relationship and emotional data
 *
 * Computes mood using valence-arousal model and optionally integrates
 * with the EmotionalState system for discrete emotions.
 *
 * @param args - NPC mood preview request
 * @returns Computed mood state with valence, arousal, and optional emotion
 * @throws Error if the request fails or returns an error response
 *
 * @example
 * ```ts
 * const mood = await previewNpcMood({
 *   worldId: 1,
 *   npcId: 12,
 *   relationshipValues: {
 *     affinity: 75,
 *     trust: 60,
 *     chemistry: 80,
 *     tension: 20
 *   }
 * });
 *
 * console.log(mood.moodId); // "excited"
 * console.log(mood.valence); // 77.5
 * console.log(mood.arousal); // 50.0
 * ```
 */
export async function previewNpcMood(
  args: NpcMoodPreviewRequest
): Promise<NpcMoodPreviewResponse> {
  const url = `${config.baseUrl}/game/npc/preview-mood`;

  const response = await requireFetch()(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      world_id: args.worldId,
      npc_id: args.npcId,
      session_id: args.sessionId,
      relationship_values: args.relationshipValues,
      emotional_state: args.emotionalState,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NPC mood preview failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  return {
    moodId: data.mood_id,
    valence: data.valence,
    arousal: data.arousal,
    emotionType: data.emotion_type,
    emotionIntensity: data.emotion_intensity,
    npcId: data.npc_id,
  };
}

// ===================
// Unified Mood Preview
// ===================

/**
 * Preview unified NPC mood (general + intimacy + active emotion).
 *
 * This is a richer view over NPC mood that combines:
 * - General valence/arousal mood
 * - Optional intimacy mood based on relationship/intimacy context
 * - Optional active discrete emotion
 */
export async function previewUnifiedMood(args: {
  worldId: number;
  npcId: number;
  sessionId?: number;
  relationshipValues?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  intimacyLevelId?: string | null;
}): Promise<UnifiedMoodState> {
  const url = `${config.baseUrl}/game/npc/preview-unified-mood`;

  const response = await requireFetch()(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      world_id: args.worldId,
      npc_id: args.npcId,
      session_id: args.sessionId,
      relationship_values: args.relationshipValues,
      // Backend expects snake_case field; TS uses camelCase
      intimacy_level_id: args.intimacyLevelId ?? undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Unified mood preview failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  const unified: UnifiedMoodState = {
    generalMood: {
      moodId: data.general_mood.mood_id,
      valence: data.general_mood.valence,
      arousal: data.general_mood.arousal,
    },
  };

  if (data.intimacy_mood) {
    unified.intimacyMood = {
      moodId: data.intimacy_mood.mood_id,
      intensity: data.intimacy_mood.intensity,
    };
  }

  if (data.active_emotion) {
    unified.activeEmotion = {
      emotionType: data.active_emotion.emotion_type,
      intensity: data.active_emotion.intensity,
      trigger: data.active_emotion.trigger,
      expiresAt: data.active_emotion.expires_at,
    };
  }

  return unified;
}

// ===================
// Reputation Band Preview
// ===================

/**
 * Preview reputation band based on relationship data or faction standings
 *
 * Supports multiple reputation types:
 * - Player-to-NPC (based on relationship affinity)
 * - NPC-to-NPC (based on stored pair relationships)
 * - Faction-based (based on faction membership standings)
 *
 * @param args - Reputation band preview request
 * @returns Computed reputation band and score
 * @throws Error if the request fails or returns an error response
 *
 * @example
 * ```ts
 * // Player-to-NPC reputation
 * const rep = await previewReputationBand({
 *   worldId: 1,
 *   subjectId: 1,
 *   subjectType: 'player',
 *   targetId: 12,
 *   targetType: 'npc',
 *   reputationScore: 75
 * });
 *
 * console.log(rep.reputationBand); // "friendly"
 * console.log(rep.reputationScore); // 75
 * ```
 *
 * @example
 * ```ts
 * // Faction-based reputation
 * const factionRep = await previewReputationBand({
 *   worldId: 1,
 *   subjectId: 1,
 *   subjectType: 'player',
 *   targetId: 5,
 *   targetType: 'faction',
 *   factionMembership: {
 *     '5': 85,  // High standing with faction 5
 *     '7': 25   // Low standing with faction 7
 *   }
 * });
 * ```
 */
export async function previewReputationBand(
  args: ReputationBandPreviewRequest
): Promise<ReputationBandPreviewResponse> {
  const url = `${config.baseUrl}/game/reputation/preview-reputation`;

  const response = await requireFetch()(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      world_id: args.worldId,
      subject_id: args.subjectId,
      subject_type: args.subjectType,
      target_id: args.targetId,
      target_type: args.targetType,
      reputation_score: args.reputationScore,
      session_id: args.sessionId,
      faction_membership: args.factionMembership,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Reputation band preview failed: ${response.status} ${error}`);
  }

  const data = await response.json();

  return {
    reputationBand: data.reputation_band,
    reputationScore: data.reputation_score,
    subjectId: data.subject_id,
    targetId: data.target_id,
    targetType: data.target_type,
  };
}
