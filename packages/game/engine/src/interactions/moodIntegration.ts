/**
 * NPC Mood Integration
 *
 * Integrates interaction system with NPC mood/emotion states.
 */

/**
 * General mood types (valence/arousal based)
 */
export type GeneralMood = 'excited' | 'content' | 'anxious' | 'calm';

/**
 * Intimacy mood types
 */
export type IntimacyMood =
  | 'playful' // Flirty, teasing
  | 'tender' // Affectionate, caring
  | 'passionate' // Intense desire
  | 'conflicted' // Want/shouldn't tension
  | 'shy' // Nervous, hesitant
  | 'eager'; // Anticipatory, excited

/**
 * Combined mood state
 */
export interface MoodState {
  /** General emotional state */
  general: {
    mood: GeneralMood;
    valence: number; // 0-1
    arousal: number; // 0-1
  };
  /** Intimacy mood (if applicable) */
  intimacy?: {
    mood: IntimacyMood;
    intensity: number; // 0-1
  };
  /** Active discrete emotions */
  activeEmotions?: Array<{
    emotion: string;
    intensity: number; // 0-1
    trigger?: string;
    expiresAt?: number; // Unix timestamp
  }>;
}

/**
 * Mood effects from interactions
 */
export interface MoodEffect {
  /** Emotion to trigger */
  emotion: string;
  /** Intensity (0-1) */
  intensity: number;
  /** Duration in seconds */
  durationSeconds?: number;
}

/**
 * Check if current mood allows an interaction
 */
export function isMoodCompatible(
  currentMood: MoodState,
  gating?: {
    allowedMoods?: string[];
    forbiddenMoods?: string[];
    maxEmotionIntensity?: number;
  }
): { compatible: boolean; reason?: string } {
  if (!gating) {
    return { compatible: true };
  }

  // Build current mood tags
  const moodTags: string[] = [currentMood.general.mood];
  if (currentMood.intimacy) {
    moodTags.push(currentMood.intimacy.mood);
  }

  // Check allowed moods
  if (gating.allowedMoods && gating.allowedMoods.length > 0) {
    const hasAllowedMood = gating.allowedMoods.some((allowed) =>
      moodTags.includes(allowed)
    );
    if (!hasAllowedMood) {
      return {
        compatible: false,
        reason: `Requires ${gating.allowedMoods.join(' or ')} mood`,
      };
    }
  }

  // Check forbidden moods
  if (gating.forbiddenMoods && gating.forbiddenMoods.length > 0) {
    const hasForbiddenMood = gating.forbiddenMoods.some((forbidden) =>
      moodTags.includes(forbidden)
    );
    if (hasForbiddenMood) {
      return {
        compatible: false,
        reason: `Not available when ${gating.forbiddenMoods.join(' or ')}`,
      };
    }
  }

  // Check emotion intensity
  if (gating.maxEmotionIntensity !== undefined && currentMood.activeEmotions) {
    const maxActiveIntensity = Math.max(
      ...currentMood.activeEmotions.map((e) => e.intensity)
    );
    if (maxActiveIntensity > gating.maxEmotionIntensity) {
      return {
        compatible: false,
        reason: 'Too emotionally intense right now',
      };
    }
  }

  return { compatible: true };
}

/**
 * Calculate how an interaction will affect mood
 */
export function calculateMoodImpact(
  currentMood: MoodState,
  relationshipDelta?: {
    affinity?: number;
    chemistry?: number;
    tension?: number;
  },
  emotionTrigger?: MoodEffect
): {
  newValence: number;
  newArousal: number;
  triggeredEmotion?: {
    emotion: string;
    intensity: number;
    expiresAt: number;
  };
} {
  let newValence = currentMood.general.valence;
  let newArousal = currentMood.general.arousal;

  // Relationship changes affect valence
  if (relationshipDelta) {
    const affinity = relationshipDelta.affinity || 0;
    const tension = relationshipDelta.tension || 0;

    // Positive affinity increases valence
    newValence += affinity * 0.01; // Scale: +10 affinity = +0.1 valence

    // Negative affinity or tension decreases valence
    newValence -= tension * 0.015;

    // Chemistry affects arousal
    const chemistry = relationshipDelta.chemistry || 0;
    newArousal += chemistry * 0.01;
  }

  // Clamp to 0-1
  newValence = Math.max(0, Math.min(1, newValence));
  newArousal = Math.max(0, Math.min(1, newArousal));

  // Emotion trigger
  let triggeredEmotion: { emotion: string; intensity: number; expiresAt: number } | undefined;

  if (emotionTrigger) {
    const now = Math.floor(Date.now() / 1000);
    const duration = emotionTrigger.durationSeconds || 3600; // 1 hour default

    triggeredEmotion = {
      emotion: emotionTrigger.emotion,
      intensity: emotionTrigger.intensity,
      expiresAt: now + duration,
    };
  }

  return {
    newValence,
    newArousal,
    triggeredEmotion,
  };
}

/**
 * Derive general mood from valence/arousal
 */
export function deriveGeneralMood(valence: number, arousal: number): GeneralMood {
  // Quadrant-based mood mapping
  if (valence >= 0.5 && arousal >= 0.5) return 'excited'; // High valence, high arousal
  if (valence >= 0.5 && arousal < 0.5) return 'content'; // High valence, low arousal
  if (valence < 0.5 && arousal >= 0.5) return 'anxious'; // Low valence, high arousal
  return 'calm'; // Low valence, low arousal
}

/**
 * Get mood-appropriate interactions
 */
export function filterByMood(
  interactions: Array<{ gating?: { mood?: { allowedMoods?: string[]; forbiddenMoods?: string[] } } }>,
  currentMood: MoodState
): Array<{ compatible: boolean; reason?: string }> {
  return interactions.map((interaction) => {
    if (!interaction.gating?.mood) {
      return { compatible: true };
    }

    return isMoodCompatible(currentMood, interaction.gating.mood);
  });
}

/**
 * Common mood-based interaction templates
 */
export const MOOD_INTERACTIONS = {
  /** When NPC is excited */
  excited: {
    allowedMoods: ['excited', 'eager'],
    forbiddenMoods: ['anxious', 'shy'],
  },

  /** When NPC is calm/content */
  peaceful: {
    allowedMoods: ['calm', 'content', 'tender'],
    forbiddenMoods: ['anxious', 'passionate'],
  },

  /** When NPC is anxious */
  reassure: {
    allowedMoods: ['anxious', 'conflicted'],
    forbiddenMoods: ['excited', 'content'],
  },

  /** When NPC is in romantic mood */
  romantic: {
    allowedMoods: ['playful', 'tender', 'passionate', 'eager'],
    forbiddenMoods: ['anxious', 'conflicted'],
  },

  /** When NPC is feeling playful */
  playful: {
    allowedMoods: ['playful', 'excited'],
    forbiddenMoods: ['anxious', 'shy'],
  },
};

/**
 * Get mood icon
 */
export function getMoodIcon(mood: GeneralMood | IntimacyMood): string {
  const icons: Record<string, string> = {
    excited: '😄',
    content: '😊',
    anxious: '😰',
    calm: '😌',
    playful: '😏',
    tender: '🥰',
    passionate: '😍',
    conflicted: '😖',
    shy: '😳',
    eager: '🤗',
  };

  return icons[mood] || '😐';
}

/**
 * Get mood color
 */
export function getMoodColor(mood: GeneralMood | IntimacyMood): string {
  const colors: Record<string, string> = {
    excited: '#FFC107', // Amber
    content: '#4CAF50', // Green
    anxious: '#FF5722', // Deep orange
    calm: '#2196F3', // Blue
    playful: '#E91E63', // Pink
    tender: '#FF4081', // Hot pink
    passionate: '#F44336', // Red
    conflicted: '#9C27B0', // Purple
    shy: '#FFB6C1', // Light pink
    eager: '#FF9800', // Orange
  };

  return colors[mood] || '#757575'; // Grey
}
