/**
 * Adapter from the metrics-system `UnifiedMoodState` (shared.types) to the
 * interactions-system `MoodState` (engine interactions module).
 *
 * The two shapes diverge:
 * - UnifiedMoodState uses camelCase nested keys (generalMood.moodId), valence
 *   and arousal on a 0-100 scale, a single activeEmotion, and ISO `expiresAt`.
 * - MoodState uses general.mood, valence/arousal on 0-1, an activeEmotions
 *   array, and unix-seconds expiresAt.
 *
 * MoodIndicator / NpcInteractionPanel consume MoodState, so callers fetching
 * via useUnifiedMood need this bridge.
 */
import type { MoodState } from '@pixsim7/game.engine';
import type { UnifiedMoodState } from '@pixsim7/shared.types';

function normalizeUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function parseExpiresAt(expiresAt?: string): number | undefined {
  if (!expiresAt) return undefined;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return undefined;
  return Math.floor(parsed / 1000);
}

export function unifiedMoodToMoodState(unified: UnifiedMoodState): MoodState {
  const state: MoodState = {
    general: {
      mood: unified.generalMood.moodId as MoodState['general']['mood'],
      valence: normalizeUnit(unified.generalMood.valence),
      arousal: normalizeUnit(unified.generalMood.arousal),
    },
  };

  if (unified.intimacyMood) {
    state.intimacy = {
      mood: unified.intimacyMood.moodId as NonNullable<MoodState['intimacy']>['mood'],
      intensity: normalizeUnit(unified.intimacyMood.intensity),
    };
  }

  if (unified.activeEmotion) {
    state.activeEmotions = [
      {
        emotion: unified.activeEmotion.emotionType,
        intensity: normalizeUnit(unified.activeEmotion.intensity),
        trigger: unified.activeEmotion.trigger,
        expiresAt: parseExpiresAt(unified.activeEmotion.expiresAt),
      },
    ];
  }

  return state;
}
