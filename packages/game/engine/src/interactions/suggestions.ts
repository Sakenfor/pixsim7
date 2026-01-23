/**
 * Smart Interaction Suggestions
 *
 * Context-aware suggestions for what interactions the player should try next.
 * Based on relationship state, game progress, available interactions, and player behavior patterns.
 *
 * Task 23: GameProfile integration - adjusts suggestion scoring based on game style and narrative profile.
 */

import type { InteractionInstance, GameProfile } from '@pixsim7/shared.types';
import { getNarrativeEmphasisWeight } from '../world/gameProfile';

/**
 * Suggestion reason/category
 */
export type SuggestionReason =
  | 'new_unlock' // Recently became available
  | 'relationship_milestone' // Close to reaching a relationship milestone
  | 'quest_progress' // Part of active quest
  | 'time_sensitive' // Limited time window
  | 'high_reward' // Large affinity/trust gain
  | 'chain_continuation' // Next step in a chain
  | 'rarely_used' // Player hasn't tried this
  | 'npc_preference' // NPC would particularly like this
  | 'contextual'; // Makes sense in current context

/**
 * Interaction suggestion with reasoning
 */
export interface InteractionSuggestion {
  /** The interaction being suggested */
  interaction: InteractionInstance;
  /** Why it's being suggested */
  reason: SuggestionReason;
  /** Score (0-100) */
  score: number;
  /** Human-readable explanation */
  explanation: string;
  /** Additional context */
  context?: {
    /** Relationship tier progress (if applicable) */
    tierProgress?: {
      current: string;
      next: string;
      affinityNeeded: number;
    };
    /** Time remaining (if time-sensitive) */
    timeRemaining?: number;
    /** Chain info (if part of chain) */
    chainInfo?: {
      chainId: string;
      chainName: string;
      stepNumber: number;
      totalSteps: number;
    };
  };
}

const getRelationshipDelta = (interaction: InteractionInstance): Record<string, number> | null => {
  const deltas = interaction.outcome?.statDeltas;
  if (!deltas) {
    return null;
  }

  const relationshipDeltas = deltas.filter(
    (delta) =>
      delta.packageId === 'core.relationships' &&
      (!delta.definitionId || delta.definitionId === 'relationships')
  );

  if (!relationshipDeltas.length) {
    return null;
  }

  return relationshipDeltas.reduce<Record<string, number>>((acc, delta) => {
    for (const [axis, value] of Object.entries(delta.axes)) {
      acc[axis] = (acc[axis] || 0) + value;
    }
    return acc;
  }, {});
};

/**
 * Suggestion configuration
 */
export interface SuggestionConfig {
  /** Max suggestions to return */
  maxSuggestions?: number;
  /** Min score threshold */
  minScore?: number;
  /** Prioritize certain reason types */
  priorityReasons?: SuggestionReason[];
  /** Include used interactions */
  includeUsed?: boolean;
  /** Consider player history */
  considerHistory?: boolean;
  /** GameProfile for world-specific tuning (Task 23) */
  gameProfile?: GameProfile;
}

/**
 * Generate interaction suggestions
 */
export function generateSuggestions(
  availableInteractions: InteractionInstance[],
  context: {
    /** Current relationship state */
    relationship?: {
      affinity: number;
      trust: number;
      chemistry: number;
      tension: number;
      tier: string;
      nextTier?: string;
      nextTierAffinity?: number;
    };
    /** Session flags */
    flags?: Record<string, any>;
    /** Interaction history (IDs used) */
    usedInteractionIds?: string[];
    /** Last interaction timestamp */
    lastInteractionTime?: number;
    /** Active chains */
    activeChains?: Array<{
      chainId: string;
      chainName: string;
      currentStep: number;
      totalSteps: number;
      nextInteractionId?: string;
    }>;
    /** Current world time */
    worldTime?: number;
    /** NPC mood state */
    mood?: {
      general: string;
      intimacy?: string;
      activeEmotions?: Array<{ emotion: string; intensity: number }>;
    };
  },
  config: SuggestionConfig = {}
): InteractionSuggestion[] {
  const {
    maxSuggestions = 5,
    minScore = 30,
    priorityReasons = ['chain_continuation', 'quest_progress', 'time_sensitive'],
    includeUsed = false,
    considerHistory = true,
    gameProfile,
  } = config;

  const suggestions: InteractionSuggestion[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Task 23: Derive suggestion tuning from GameProfile
  const narrativeWeight = gameProfile?.narrativeProfile
    ? getNarrativeEmphasisWeight(gameProfile.narrativeProfile)
    : 0.5;
  const isLifeSim = gameProfile?.style === 'life_sim';
  const isVisualNovel = gameProfile?.style === 'visual_novel';

  for (const interaction of availableInteractions) {
    // Skip if already used (unless config allows)
    if (!includeUsed && considerHistory && context.usedInteractionIds?.includes(interaction.id)) {
      continue;
    }

    let score = 50; // Base score
    let reason: SuggestionReason = 'contextual';
    let explanation = '';
    let suggestionContext: InteractionSuggestion['context'] = {};

    // Check if part of active chain
    const chainInfo = context.activeChains?.find(
      (chain) => chain.nextInteractionId === interaction.id
    );

    if (chainInfo) {
      // Task 23: Boost chain continuation more for VN/heavy narrative
      const chainBoost = isVisualNovel ? 50 : 40;
      const narrativeBonus = narrativeWeight > 0.6 ? 10 : 0;
      score += chainBoost + narrativeBonus;
      reason = 'chain_continuation';
      explanation = `Continue ${chainInfo.chainName} (step ${chainInfo.currentStep + 1}/${chainInfo.totalSteps})`;
      suggestionContext.chainInfo = {
        chainId: chainInfo.chainId,
        chainName: chainInfo.chainName,
        stepNumber: chainInfo.currentStep + 1,
        totalSteps: chainInfo.totalSteps,
      };
    }

    // Check if related to quest
    const isQuestRelated = interaction.id.includes('quest') || interaction.label.toLowerCase().includes('quest');
    if (isQuestRelated) {
      score += 35;
      if (reason === 'contextual') {
        reason = 'quest_progress';
        explanation = 'Advance active quest';
      }
    }

    // Check if recently unlocked
    if (context.lastInteractionTime) {
      // If we have a timestamp when this interaction became available
      const interactionMeta = (interaction as any)._metadata;
      if (interactionMeta?.unlockedAt) {
        const timeSinceUnlock = now - interactionMeta.unlockedAt;
        if (timeSinceUnlock < 300) {
          // 5 minutes
          score += 30;
          if (reason === 'contextual') {
            reason = 'new_unlock';
            explanation = 'Just became available!';
          }
        }
      }
    }

    // Check if approaches relationship milestone
    const relationshipDeltas = getRelationshipDelta(interaction);
    if (context.relationship && relationshipDeltas) {
      const currentAffinity = context.relationship.affinity;
      const nextTierAffinity = context.relationship.nextTierAffinity;

      if (nextTierAffinity && relationshipDeltas.affinity) {
        const affinityAfter = currentAffinity + relationshipDeltas.affinity;
        const affinityNeeded = nextTierAffinity - currentAffinity;

        if (affinityNeeded > 0 && affinityNeeded <= 10) {
          // Task 23: Boost relationship milestones more for VN/heavy narrative
          const milestoneBoost = isVisualNovel ? 35 : 25;
          const narrativeBonus = narrativeWeight > 0.6 ? 10 : 0;
          score += milestoneBoost + narrativeBonus;
          if (reason === 'contextual') {
            reason = 'relationship_milestone';
            explanation = `Gain ${relationshipDeltas.affinity} affinity (${affinityNeeded} needed for ${context.relationship.nextTier})`;
            suggestionContext.tierProgress = {
              current: context.relationship.tier,
              next: context.relationship.nextTier!,
              affinityNeeded,
            };
          }
        }
      }
    }

    // Check if high reward
    if (relationshipDeltas) {
      const totalDelta =
        (relationshipDeltas.affinity || 0) +
        (relationshipDeltas.trust || 0) +
        (relationshipDeltas.chemistry || 0);

      if (totalDelta >= 8) {
        score += 20;
        if (reason === 'contextual') {
          reason = 'high_reward';
          explanation = `High relationship gain (+${totalDelta})`;
        }
      }
    }

    // Check if time-sensitive
    if (interaction.gating?.timeOfDay) {
      const timeGating = interaction.gating.timeOfDay;
      if (context.worldTime) {
        const currentHour = Math.floor((context.worldTime / 3600) % 24);

        // Check if near end of time window
        if (timeGating.maxHour !== undefined) {
          const hoursRemaining = timeGating.maxHour - currentHour;
          if (hoursRemaining > 0 && hoursRemaining <= 2) {
            score += 30;
            if (reason === 'contextual') {
              reason = 'time_sensitive';
              explanation = `Only ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''} remaining`;
              suggestionContext.timeRemaining = hoursRemaining * 3600;
            }
          }
        }
      }
    }

    // Check if rarely used
    if (considerHistory && !context.usedInteractionIds?.includes(interaction.id)) {
      score += 10;
      if (reason === 'contextual') {
        reason = 'rarely_used';
        explanation = 'Haven\'t tried this yet';
      }
    }

    // Check mood compatibility
    if (context.mood && interaction.gating?.mood) {
      const moodGating = interaction.gating.mood;
      const moodTags = [context.mood.general];
      if (context.mood.intimacy) {
        moodTags.push(context.mood.intimacy);
      }

      // Boost if matches allowed moods
      if (moodGating.allowedMoods) {
        const moodMatches = moodGating.allowedMoods.some((allowed) =>
          moodTags.includes(allowed)
        );
        if (moodMatches) {
          score += 20;
          if (reason === 'contextual') {
            reason = 'npc_preference';
            explanation = `Perfect for their current mood (${context.mood.general})`;
          }
        }
      }
    }

    // Check NPC preference (if specified in interaction metadata)
    const interactionMeta = (interaction as any)._metadata;
    if (interactionMeta?.npcPreference === 'high') {
      score += 15;
      if (reason === 'contextual') {
        reason = 'npc_preference';
        explanation = 'They would really appreciate this';
      }
    }

    // Task 23: Boost everyday/ambient interactions for life-sim with light narrative
    const isEverydayInteraction =
      interaction.surface === 'inline' ||
      interaction.surface === 'ambient' ||
      interaction.label.toLowerCase().includes('talk') ||
      interaction.label.toLowerCase().includes('chat') ||
      interaction.label.toLowerCase().includes('hang out');

    if (isEverydayInteraction && isLifeSim && narrativeWeight < 0.4) {
      score += 15;
      if (reason === 'contextual') {
        explanation = 'Good casual interaction for daily routine';
      }
    }

    // Task 23: Reduce everyday interaction priority for VN with heavy narrative
    if (isEverydayInteraction && isVisualNovel && narrativeWeight > 0.6) {
      score -= 10;
    }

    // Default explanation
    if (!explanation) {
      explanation = 'Good choice for current situation';
    }

    // Only add if meets min score
    if (score >= minScore) {
      suggestions.push({
        interaction,
        reason,
        score,
        explanation,
        context: Object.keys(suggestionContext).length > 0 ? suggestionContext : undefined,
      });
    }
  }

  // Sort by priority reasons first, then score
  suggestions.sort((a, b) => {
    // Priority reasons first
    const aPriority = priorityReasons.includes(a.reason);
    const bPriority = priorityReasons.includes(b.reason);

    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;

    // Then by score
    return b.score - a.score;
  });

  // Limit to max suggestions
  return suggestions.slice(0, maxSuggestions);
}

/**
 * Get suggestion icon for reason
 */
export function getSuggestionIcon(reason: SuggestionReason): string {
  switch (reason) {
    case 'new_unlock':
      return '🆕';
    case 'relationship_milestone':
      return '💝';
    case 'quest_progress':
      return '📜';
    case 'time_sensitive':
      return '⏰';
    case 'high_reward':
      return '⭐';
    case 'chain_continuation':
      return '🔗';
    case 'rarely_used':
      return '🔍';
    case 'npc_preference':
      return '💕';
    case 'contextual':
      return '💡';
    default:
      return '•';
  }
}

/**
 * Get suggestion badge color
 */
export function getSuggestionColor(reason: SuggestionReason): string {
  switch (reason) {
    case 'new_unlock':
      return '#4CAF50'; // Green
    case 'relationship_milestone':
      return '#E91E63'; // Pink
    case 'quest_progress':
      return '#FF9800'; // Orange
    case 'time_sensitive':
      return '#F44336'; // Red
    case 'high_reward':
      return '#FFD700'; // Gold
    case 'chain_continuation':
      return '#2196F3'; // Blue
    case 'rarely_used':
      return '#9C27B0'; // Purple
    case 'npc_preference':
      return '#FF4081'; // Hot pink
    case 'contextual':
      return '#607D8B'; // Blue grey
    default:
      return '#757575'; // Grey
  }
}

/**
 * Format suggestion score as visual indicator
 */
export function formatSuggestionScore(score: number): string {
  if (score >= 80) return '⭐⭐⭐';
  if (score >= 60) return '⭐⭐';
  if (score >= 40) return '⭐';
  return '';
}
