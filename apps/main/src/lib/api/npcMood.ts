/**
 * NPC Mood Preview API Client
 *
 * Thin wrappers around `/api/v1/game/npc/preview-mood` and
 * `/preview-unified-mood`. Includes a mapper from the backend payload to the
 * frontend `MoodState` shape consumed by `MoodIndicator` /
 * `NpcInteractionPanel`.
 */

import type { MoodState } from '@pixsim7/game.engine';

import { pixsimClient } from './client';

export interface PreviewMoodRelationshipValues {
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
}

export interface PreviewMoodEmotionalState {
  emotion: string;
  intensity: number;
}

export interface PreviewMoodRequest {
  worldId: number;
  npcId: number;
  sessionId?: number;
  relationshipValues?: PreviewMoodRelationshipValues;
  emotionalState?: PreviewMoodEmotionalState;
}

interface UnifiedMoodGeneralResponse {
  mood_id: string;
  valence: number;
  arousal: number;
}

interface UnifiedMoodIntimacyResponse {
  mood_id: string;
  intensity: number;
}

interface UnifiedMoodActiveEmotionResponse {
  emotion_type: string;
  intensity: number;
  trigger?: string | null;
  expires_at?: string | null;
}

export interface UnifiedMoodResponse {
  general_mood: UnifiedMoodGeneralResponse;
  intimacy_mood?: UnifiedMoodIntimacyResponse | null;
  active_emotion?: UnifiedMoodActiveEmotionResponse | null;
}

function toBackendPayload(req: PreviewMoodRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    world_id: req.worldId,
    npc_id: req.npcId,
  };
  if (req.sessionId !== undefined) {
    payload.session_id = req.sessionId;
  }
  if (req.relationshipValues) {
    payload.relationship_values = req.relationshipValues;
  }
  if (req.emotionalState) {
    payload.emotional_state = req.emotionalState;
  }
  return payload;
}

export async function previewUnifiedMood(
  req: PreviewMoodRequest
): Promise<UnifiedMoodResponse> {
  return pixsimClient.post<UnifiedMoodResponse>(
    '/game/npc/preview-unified-mood',
    toBackendPayload(req)
  );
}

// Backend returns valence/arousal on a 0-100 scale; MoodState expects 0-1.
function normalizeUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function parseExpiresAt(expiresAt?: string | null): number | undefined {
  if (!expiresAt) return undefined;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return undefined;
  return Math.floor(parsed / 1000);
}

export function unifiedMoodToMoodState(response: UnifiedMoodResponse): MoodState {
  const state: MoodState = {
    general: {
      mood: response.general_mood.mood_id as MoodState['general']['mood'],
      valence: normalizeUnit(response.general_mood.valence),
      arousal: normalizeUnit(response.general_mood.arousal),
    },
  };

  if (response.intimacy_mood) {
    state.intimacy = {
      mood: response.intimacy_mood.mood_id as NonNullable<MoodState['intimacy']>['mood'],
      intensity: normalizeUnit(response.intimacy_mood.intensity),
    };
  }

  if (response.active_emotion) {
    state.activeEmotions = [
      {
        emotion: response.active_emotion.emotion_type,
        intensity: normalizeUnit(response.active_emotion.intensity),
        trigger: response.active_emotion.trigger ?? undefined,
        expiresAt: parseExpiresAt(response.active_emotion.expires_at),
      },
    ];
  }

  return state;
}

export async function previewMoodState(req: PreviewMoodRequest): Promise<MoodState> {
  const response = await previewUnifiedMood(req);
  return unifiedMoodToMoodState(response);
}
