/**
 * Social Mechanics Calculations
 *
 * Pure math functions for social interaction success calculations.
 * Used by persuade/seduce interactions and available for other social systems.
 */

/**
 * Intimacy level progression ladder
 */
export const INTIMACY_LEVELS = [
  'stranger',
  'acquaintance',
  'friend',
  'close_friend',
  'light_flirt',
  'flirting',
  'romantic_interest',
  'intimate',
  'lovers',
  'deep_bond',
] as const;

export type IntimacyLevel = (typeof INTIMACY_LEVELS)[number];

/**
 * Get the index of an intimacy level
 */
export function getIntimacyLevelIndex(level: string | null | undefined): number {
  if (!level) return -1;
  return INTIMACY_LEVELS.indexOf(level as IntimacyLevel);
}

/**
 * Check if a level is at least a certain minimum
 */
export function meetsIntimacyMinimum(
  currentLevel: string | null | undefined,
  minimumLevel: IntimacyLevel
): boolean {
  const currentIndex = getIntimacyLevelIndex(currentLevel);
  const minimumIndex = INTIMACY_LEVELS.indexOf(minimumLevel);
  return currentIndex >= minimumIndex;
}

/**
 * Get next intimacy level in the progression
 */
export function advanceIntimacyLevel(currentLevel: string | null | undefined): string {
  if (!currentLevel) {
    return 'light_flirt'; // Start flirting
  }

  const currentIndex = INTIMACY_LEVELS.indexOf(currentLevel as IntimacyLevel);
  if (currentIndex === -1 || currentIndex >= INTIMACY_LEVELS.length - 1) {
    return currentLevel; // Already at max or unknown level
  }

  return INTIMACY_LEVELS[currentIndex + 1];
}

/**
 * Get previous intimacy level (for relationship decay)
 */
export function regressIntimacyLevel(currentLevel: string | null | undefined): string {
  if (!currentLevel) {
    return 'stranger';
  }

  const currentIndex = INTIMACY_LEVELS.indexOf(currentLevel as IntimacyLevel);
  if (currentIndex <= 0) {
    return 'stranger';
  }

  return INTIMACY_LEVELS[currentIndex - 1];
}

/**
 * Parameters for persuasion chance calculation
 */
export interface PersuasionParams {
  /** NPC's current affinity toward player (0-100) */
  affinity: number;
  /** Player's charm/charisma stat (0-100) */
  charm: number;
  /** Difficulty modifier (0-1, higher = harder) */
  difficulty: number;
  /** How much affinity contributes to success (0-1) */
  affinityBonus: number;
}

/**
 * Calculate success chance for persuasion attempt
 *
 * Formula:
 * - Base chance from charm (0-100 -> 0-0.5)
 * - Affinity bonus (0-100 -> 0 to affinityBonus)
 * - Combined and adjusted by difficulty
 * - Clamped between 10% and 90%
 */
export function calculatePersuadeChance(params: PersuasionParams): number {
  const { affinity, charm, difficulty, affinityBonus } = params;

  // Base chance from charm (0-100 -> 0-0.5)
  const charmComponent = (charm / 100) * 0.5;

  // Affinity bonus (0-100 -> 0 to affinityBonus)
  const affinityComponent = (affinity / 100) * affinityBonus;

  // Combine and apply difficulty
  const baseChance = charmComponent + affinityComponent;
  const adjustedChance = baseChance * (1 - difficulty * 0.5);

  return Math.max(0.1, Math.min(0.9, adjustedChance)); // Clamp between 10% and 90%
}

/**
 * Parameters for seduction chance calculation
 */
export interface SeductionParams {
  /** NPC's current chemistry with player (0-100) */
  chemistry: number;
  /** Player's charm/charisma stat (0-100) */
  charm: number;
  /** Difficulty modifier (0-1, higher = harder) */
  difficulty: number;
  /** How much chemistry contributes to success (0-1) */
  chemistryBonus: number;
}

/**
 * Calculate success chance for seduction attempt
 *
 * Formula:
 * - Base chance from charm (0-100 -> 0-0.4)
 * - Chemistry bonus (0-100 -> 0 to chemistryBonus)
 * - Combined and adjusted by difficulty (seduction is harder)
 * - Clamped between 5% and 85%
 */
export function calculateSeduceChance(params: SeductionParams): number {
  const { chemistry, charm, difficulty, chemistryBonus } = params;

  // Base chance from charm (0-100 -> 0-0.4)
  const charmComponent = (charm / 100) * 0.4;

  // Chemistry bonus (0-100 -> 0 to chemistryBonus)
  const chemistryComponent = (chemistry / 100) * chemistryBonus;

  // Combine and apply difficulty
  const baseChance = charmComponent + chemistryComponent;
  const adjustedChance = baseChance * (1 - difficulty * 0.6); // Seduction is harder

  return Math.max(0.05, Math.min(0.85, adjustedChance)); // Clamp between 5% and 85%
}

/**
 * Result of a social interaction roll
 */
export interface SocialRollResult {
  /** Whether the roll succeeded */
  success: boolean;
  /** The calculated success chance (0-1) */
  chance: number;
  /** The random roll value (0-1) */
  roll: number;
  /** How much the roll beat or missed the threshold */
  margin: number;
}

/**
 * Perform a social interaction roll
 */
export function rollSocialInteraction(chance: number): SocialRollResult {
  const roll = Math.random();
  const success = roll < chance;
  return {
    success,
    chance,
    roll,
    margin: success ? chance - roll : roll - chance,
  };
}

/**
 * Calculate relationship value change based on outcome
 */
export function calculateRelationshipChange(
  currentValue: number,
  change: number,
  min = 0,
  max = 100
): number {
  return Math.max(min, Math.min(max, currentValue + change));
}
