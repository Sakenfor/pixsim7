/**
 * Persuade/Seduce Interaction Plugin
 *
 * Two-mode interaction system:
 * 1. Persuade Mode (SFW): Convince NPC to agree to requests
 * 2. Seduce Mode (NSFW): Advance romantic/intimate relationship
 *
 * Features:
 * - Dynamic success calculation based on relationship stats + charm
 * - Configurable consequences for success/failure
 * - Consent checks for seduction (respects NPC boundaries)
 * - Integrates with session state and relationship system
 */
import { canAttemptSeduction, type IntimacyGatingConfig } from '@features/intimacy';

import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from './types';

/**
 * Persuade/Seduce interaction config
 */
export interface PersuadeConfig extends BaseInteractionConfig {
  // Mode selection
  mode: 'persuade' | 'seduce';

  // Player stats
  charmStat: number; // Player's charm/charisma (0-100)

  // Difficulty settings
  difficulty: number; // 0-1, higher = harder (affects success chance)

  // Persuade mode settings
  persuadeAffinityBonus: number; // How much affinity helps (0-1)
  persuadeTrustPenalty: number; // Trust lost on failure (0-20)
  persuadeAffinityReward: number; // Affinity gained on success (0-10)

  // Seduce mode settings
  minAffinityForSeduction: number; // Minimum affinity required (0-100)
  minChemistryForSeduction: number; // Minimum chemistry required (0-100)
  seductionChemistryBonus: number; // How much chemistry helps (0-1)
  seductionTrustPenalty: number; // Trust lost on failure (0-30)
  seductionChemistryPenalty: number; // Chemistry lost on failure (0-20)
  seductionAffinityReward: number; // Affinity gained on success (0-10)
  seductionChemistryReward: number; // Chemistry gained on success (0-15)
  advanceIntimacyOnSuccess: boolean; // Whether to advance intimacy level

  // Consent & boundaries
  consentChecks: boolean; // Whether to check NPC preferences/boundaries
  blockIfInappropriate: boolean; // Block if intimacy level too low

  // Scene triggers
  persuadeSuccessSceneId?: number | null;
  persuadeFailureSceneId?: number | null;
  seduceSuccessSceneId?: number | null;
  seduceFailureSceneId?: number | null;

  // Flags
  onPersuadeSuccessFlags?: string[];
  onPersuadeFailFlags?: string[];
  onSeduceSuccessFlags?: string[];
  onSeduceFailFlags?: string[];
}

/**
 * Intimacy level progression ladder
 */
const INTIMACY_LEVELS = [
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
];

/**
 * Get next intimacy level
 */
function advanceIntimacyLevel(currentLevel: string | null | undefined): string {
  if (!currentLevel) {
    return 'light_flirt'; // Start flirting
  }

  const currentIndex = INTIMACY_LEVELS.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex >= INTIMACY_LEVELS.length - 1) {
    return currentLevel; // Already at max or unknown level
  }

  return INTIMACY_LEVELS[currentIndex + 1];
}

/**
 * Calculate success chance for persuasion
 */
function calculatePersuadeChance(
  affinity: number,
  charm: number,
  difficulty: number,
  affinityBonus: number
): number {
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
 * Calculate success chance for seduction
 */
function calculateSeduceChance(
  chemistry: number,
  charm: number,
  difficulty: number,
  chemistryBonus: number
): number {
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
 * Persuade/Seduce interaction plugin
 */
export const persuadePlugin: InteractionPlugin<PersuadeConfig> = {
  id: 'persuade',
  name: 'Persuade/Seduce',
  description: 'Attempt to persuade or seduce the NPC',
  icon: '💋',
  category: 'social',
  version: '1.0.0',
  tags: ['social', 'persuasion', 'seduction', 'risky'],

  // UI behavior: may open dialogue scenes
  uiMode: 'custom',

  // Capabilities for UI hints
  capabilities: {
    opensDialogue: true, // Can open success/failure scenes
    affectsRelationship: true,
    hasRisk: true,
    triggersEvents: true,
  },

  defaultConfig: {
    enabled: true,
    mode: 'persuade',
    charmStat: 50,
    difficulty: 0.5,

    // Persuade defaults
    persuadeAffinityBonus: 0.4,
    persuadeTrustPenalty: 5,
    persuadeAffinityReward: 3,

    // Seduce defaults
    minAffinityForSeduction: 30,
    minChemistryForSeduction: 20,
    seductionChemistryBonus: 0.5,
    seductionTrustPenalty: 15,
    seductionChemistryPenalty: 10,
    seductionAffinityReward: 5,
    seductionChemistryReward: 10,
    advanceIntimacyOnSuccess: true,

    // Consent
    consentChecks: true,
    blockIfInappropriate: true,

    // Scenes
    persuadeSuccessSceneId: null,
    persuadeFailureSceneId: null,
    seduceSuccessSceneId: null,
    seduceFailureSceneId: null,

    // Flags
    onPersuadeSuccessFlags: [],
    onPersuadeFailFlags: [],
    onSeduceSuccessFlags: [],
    onSeduceFailFlags: [],
  },

  configFields: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      description: 'Interaction mode',
      options: [
        { value: 'persuade', label: '💬 Persuade (SFW)' },
        { value: 'seduce', label: '💋 Seduce (NSFW)' },
      ],
    },
    {
      key: 'charmStat',
      label: 'Player Charm Stat',
      type: 'number',
      min: 0,
      max: 100,
      description: 'Player\'s charm/charisma stat',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'Overall difficulty (0 = easy, 1 = very hard)',
    },

    // Persuade settings
    {
      key: 'persuadeAffinityBonus',
      label: 'Persuade: Affinity Bonus Weight',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'How much affinity affects persuasion success',
    },
    {
      key: 'persuadeTrustPenalty',
      label: 'Persuade: Trust Penalty on Fail',
      type: 'number',
      min: 0,
      max: 20,
      description: 'Trust lost when persuasion fails',
    },
    {
      key: 'persuadeAffinityReward',
      label: 'Persuade: Affinity Reward on Success',
      type: 'number',
      min: 0,
      max: 10,
      description: 'Affinity gained when persuasion succeeds',
    },

    // Seduce settings
    {
      key: 'minAffinityForSeduction',
      label: 'Seduce: Minimum Affinity',
      type: 'number',
      min: 0,
      max: 100,
      description: 'Minimum affinity required to attempt seduction',
    },
    {
      key: 'minChemistryForSeduction',
      label: 'Seduce: Minimum Chemistry',
      type: 'number',
      min: 0,
      max: 100,
      description: 'Minimum chemistry required to attempt seduction',
    },
    {
      key: 'seductionChemistryBonus',
      label: 'Seduce: Chemistry Bonus Weight',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      description: 'How much chemistry affects seduction success',
    },
    {
      key: 'seductionTrustPenalty',
      label: 'Seduce: Trust Penalty on Fail',
      type: 'number',
      min: 0,
      max: 30,
      description: 'Trust lost when seduction fails',
    },
    {
      key: 'seductionChemistryPenalty',
      label: 'Seduce: Chemistry Penalty on Fail',
      type: 'number',
      min: 0,
      max: 20,
      description: 'Chemistry lost when seduction fails',
    },
    {
      key: 'seductionAffinityReward',
      label: 'Seduce: Affinity Reward on Success',
      type: 'number',
      min: 0,
      max: 10,
      description: 'Affinity gained when seduction succeeds',
    },
    {
      key: 'seductionChemistryReward',
      label: 'Seduce: Chemistry Reward on Success',
      type: 'number',
      min: 0,
      max: 15,
      description: 'Chemistry gained when seduction succeeds',
    },
    {
      key: 'advanceIntimacyOnSuccess',
      label: 'Seduce: Advance Intimacy on Success',
      type: 'boolean',
      description: 'Whether to advance intimacy level on successful seduction',
    },

    // Consent
    {
      key: 'consentChecks',
      label: 'Enable Consent Checks',
      type: 'boolean',
      description: 'Check NPC preferences and boundaries (recommended)',
    },
    {
      key: 'blockIfInappropriate',
      label: 'Block if Intimacy Too Low',
      type: 'boolean',
      description: 'Prevent seduction if intimacy level is inappropriate',
    },

    // Scenes
    {
      key: 'persuadeSuccessSceneId',
      label: 'Persuade Success Scene ID',
      type: 'number',
      placeholder: 'Optional',
      description: 'Scene to trigger when persuasion succeeds',
    },
    {
      key: 'persuadeFailureSceneId',
      label: 'Persuade Failure Scene ID',
      type: 'number',
      placeholder: 'Optional',
      description: 'Scene to trigger when persuasion fails',
    },
    {
      key: 'seduceSuccessSceneId',
      label: 'Seduce Success Scene ID',
      type: 'number',
      placeholder: 'Optional',
      description: 'Scene to trigger when seduction succeeds',
    },
    {
      key: 'seduceFailureSceneId',
      label: 'Seduce Failure Scene ID',
      type: 'number',
      placeholder: 'Optional',
      description: 'Scene to trigger when seduction fails',
    },

    // Flags
    {
      key: 'onPersuadeSuccessFlags',
      label: 'Persuade Success Flags',
      type: 'tags',
      placeholder: 'e.g., persuaded_npc',
      description: 'Flags to set when persuasion succeeds',
    },
    {
      key: 'onPersuadeFailFlags',
      label: 'Persuade Fail Flags',
      type: 'tags',
      placeholder: 'e.g., persuade_rejected',
      description: 'Flags to set when persuasion fails',
    },
    {
      key: 'onSeduceSuccessFlags',
      label: 'Seduce Success Flags',
      type: 'tags',
      placeholder: 'e.g., seduced_npc',
      description: 'Flags to set when seduction succeeds',
    },
    {
      key: 'onSeduceFailFlags',
      label: 'Seduce Fail Flags',
      type: 'tags',
      placeholder: 'e.g., seduction_rejected',
      description: 'Flags to set when seduction fails',
    },
  ],

  async execute(config: PersuadeConfig, context: InteractionContext): Promise<InteractionResult> {
    const npcId = context.state.assignment.npcId;
    const gameSession = context.state.gameSession;

    if (!npcId) {
      return { success: false, message: 'No NPC assigned to this slot' };
    }

    if (!gameSession) {
      context.onError('No game session active. Please start a scene first.');
      return { success: false, message: 'No active game session' };
    }

    // Get NPC relationship state
    const relState = context.session.getNpcRelationship(npcId);
    if (!relState) {
      context.onError('No relationship data found for this NPC');
      return { success: false, message: 'No relationship data' };
    }

    try {
      // Route to appropriate mode
      if (config.mode === 'persuade') {
        return await executePersuade(config, context, npcId, relState);
      } else {
        return await executeSeduce(config, context, npcId, relState);
      }
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e);
      context.onError(errorMsg);
      return { success: false, message: errorMsg };
    }
  },

  validate(config: PersuadeConfig): string | null {
    if (config.charmStat < 0 || config.charmStat > 100) {
      return 'Charm stat must be between 0 and 100';
    }
    if (config.difficulty < 0 || config.difficulty > 1) {
      return 'Difficulty must be between 0 and 1';
    }
    if (config.mode !== 'persuade' && config.mode !== 'seduce') {
      return 'Mode must be either "persuade" or "seduce"';
    }
    return null;
  },

  isAvailable(context: InteractionContext): boolean {
    // Available if there's a game session and an NPC assigned
    return context.state.gameSession !== null && context.state.assignment.npcId !== null;
  },
};

/**
 * Execute persuade mode
 */
async function executePersuade(
  config: PersuadeConfig,
  context: InteractionContext,
  npcId: number,
  relState: any
): Promise<InteractionResult> {
  const affinity = relState.affinity ?? 0;
  const trust = relState.trust ?? 50;

  // Calculate success chance
  const successChance = calculatePersuadeChance(
    affinity,
    config.charmStat,
    config.difficulty,
    config.persuadeAffinityBonus
  );

  // Roll the dice!
  const roll = Math.random();
  const success = roll < successChance;

  if (success) {
    // SUCCESS: Increase affinity
    const newAffinity = Math.min(100, affinity + config.persuadeAffinityReward);

    await context.session.updateNpcRelationship(npcId, {
      affinity: newAffinity,
    });

    // Set success flags
    if (config.onPersuadeSuccessFlags && config.onPersuadeSuccessFlags.length > 0) {
      const currentFlags = relState.flags || [];
      await context.session.updateNpcRelationship(npcId, {
        flags: [...currentFlags, ...config.onPersuadeSuccessFlags],
      });
    }

    const message = `✅ Persuasion succeeded! NPC is convinced. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onSuccess(message);

    // Trigger success scene if configured
    if (config.persuadeSuccessSceneId) {
      await context.onSceneOpen(config.persuadeSuccessSceneId, npcId);
    }

    return {
      success: true,
      message,
      data: {
        roll,
        successChance,
        affinityChange: config.persuadeAffinityReward,
      },
    };
  } else {
    // FAILURE: Decrease trust
    const newTrust = Math.max(0, trust - config.persuadeTrustPenalty);

    await context.session.updateNpcRelationship(npcId, {
      trust: newTrust,
    });

    // Set failure flags
    if (config.onPersuadeFailFlags && config.onPersuadeFailFlags.length > 0) {
      const currentFlags = relState.flags || [];
      await context.session.updateNpcRelationship(npcId, {
        flags: [...currentFlags, ...config.onPersuadeFailFlags],
      });
    }

    const message = `❌ Persuasion failed. NPC is unconvinced and trust decreased. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onError(message);

    // Trigger failure scene if configured
    if (config.persuadeFailureSceneId) {
      await context.onSceneOpen(config.persuadeFailureSceneId, npcId);
    }

    return {
      success: false,
      message,
      data: {
        roll,
        successChance,
        trustChange: -config.persuadeTrustPenalty,
      },
    };
  }
}

/**
 * Execute seduce mode
 */
async function executeSeduce(
  config: PersuadeConfig,
  context: InteractionContext,
  npcId: number,
  relState: any
): Promise<InteractionResult> {
  const affinity = relState.affinity ?? 0;
  const chemistry = relState.chemistry ?? 0;
  const trust = relState.trust ?? 50;
  const intimacyLevel = relState.levelId;

  // Build gating config from interaction config (for backwards compatibility)
  const gatingConfig: Partial<IntimacyGatingConfig> = {
    interactions: {
      seduction: {
        minimumAffinity: config.minAffinityForSeduction,
        minimumChemistry: config.minChemistryForSeduction,
        // Use default appropriate levels unless consent checks are disabled
        appropriateLevels: config.consentChecks && config.blockIfInappropriate
          ? undefined // Use defaults
          : [], // Empty array = no level restrictions
      },
    },
  };

  // Use shared gating helper
  const seductionCheck = canAttemptSeduction(
    {
      affinity,
      chemistry,
      trust,
      levelId: intimacyLevel,
    },
    gatingConfig
  );

  if (!seductionCheck.allowed) {
    const msg = `❌ ${seductionCheck.reason}`;
    context.onError(msg);
    return { success: false, message: msg };
  }

  // Calculate success chance
  const successChance = calculateSeduceChance(
    chemistry,
    config.charmStat,
    config.difficulty,
    config.seductionChemistryBonus
  );

  // Roll the dice!
  const roll = Math.random();
  const success = roll < successChance;

  if (success) {
    // SUCCESS: Increase affinity, chemistry, advance intimacy
    const newAffinity = Math.min(100, affinity + config.seductionAffinityReward);
    const newChemistry = Math.min(100, chemistry + config.seductionChemistryReward);

    const updates: any = {
      affinity: newAffinity,
      chemistry: newChemistry,
    };

    // Advance intimacy level
    if (config.advanceIntimacyOnSuccess) {
      const newIntimacyLevel = advanceIntimacyLevel(intimacyLevel);
      updates.levelId = newIntimacyLevel;
    }

    await context.session.updateNpcRelationship(npcId, updates);

    // Set success flags
    if (config.onSeduceSuccessFlags && config.onSeduceSuccessFlags.length > 0) {
      const currentFlags = relState.flags || [];
      await context.session.updateNpcRelationship(npcId, {
        flags: [...currentFlags, ...config.onSeduceSuccessFlags],
      });
    }

    const intimacyMsg = config.advanceIntimacyOnSuccess
      ? ` Intimacy advanced to: ${updates.levelId}.`
      : '';
    const message = `💋 Seduction succeeded!${intimacyMsg} (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onSuccess(message);

    // Trigger success scene if configured
    if (config.seduceSuccessSceneId) {
      await context.onSceneOpen(config.seduceSuccessSceneId, npcId);
    }

    return {
      success: true,
      message,
      data: {
        roll,
        successChance,
        affinityChange: config.seductionAffinityReward,
        chemistryChange: config.seductionChemistryReward,
        newIntimacyLevel: updates.levelId,
      },
    };
  } else {
    // FAILURE: Decrease trust and chemistry
    const newTrust = Math.max(0, trust - config.seductionTrustPenalty);
    const newChemistry = Math.max(0, chemistry - config.seductionChemistryPenalty);

    await context.session.updateNpcRelationship(npcId, {
      trust: newTrust,
      chemistry: newChemistry,
    });

    // Set failure flags
    if (config.onSeduceFailFlags && config.onSeduceFailFlags.length > 0) {
      const currentFlags = relState.flags || [];
      await context.session.updateNpcRelationship(npcId, {
        flags: [...currentFlags, ...config.onSeduceFailFlags],
      });
    }

    const message = `💔 Seduction failed. NPC rejected your advances. Trust and chemistry decreased. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onError(message);

    // Trigger failure scene if configured
    if (config.seduceFailureSceneId) {
      await context.onSceneOpen(config.seduceFailureSceneId, npcId);
    }

    return {
      success: false,
      message,
      data: {
        roll,
        successChance,
        trustChange: -config.seductionTrustPenalty,
        chemistryChange: -config.seductionChemistryPenalty,
      },
    };
  }
}
