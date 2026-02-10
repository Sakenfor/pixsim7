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
 *
 * Moved from apps/main/src/lib/game/interactions/persuade.ts
 */
import type { IntimacyGatingConfig } from '@pixsim7/shared.types';
import {
  advanceIntimacyLevel,
  calculatePersuadeChance as calculatePersuadeChanceCore,
  calculateSeduceChance as calculateSeduceChanceCore,
} from '../socialMechanics';
import { canAttemptSeduction } from '../intimacyGating';

import type {
  InteractionPlugin,
  BaseInteractionConfig,
  InteractionContext,
  InteractionResult,
} from '../registry';

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

// Local wrapper functions to maintain original call signature
function calculatePersuadeChance(
  affinity: number,
  charm: number,
  difficulty: number,
  affinityBonus: number
): number {
  return calculatePersuadeChanceCore({ affinity, charm, difficulty, affinityBonus });
}

function calculateSeduceChance(
  chemistry: number,
  charm: number,
  difficulty: number,
  chemistryBonus: number
): number {
  return calculateSeduceChanceCore({ chemistry, charm, difficulty, chemistryBonus });
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

    if (!context.session.getRelationship(npcId)) {
      context.onError('No relationship data found for this NPC');
      return { success: false, message: 'No relationship data' };
    }

    try {
      if (config.mode === 'persuade') {
        return await executePersuade(config, context, npcId);
      } else {
        return await executeSeduce(config, context, npcId);
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
): Promise<InteractionResult> {
  const { session } = context;
  const affinity = session.getRelationshipValue(npcId, 'affinity');
  const trust = session.getRelationshipValue(npcId, 'trust');

  const successChance = calculatePersuadeChance(
    affinity, config.charmStat, config.difficulty, config.persuadeAffinityBonus
  );

  const roll = Math.random();
  const success = roll < successChance;

  if (success) {
    const newAffinity = Math.min(100, affinity + config.persuadeAffinityReward);

    await session.updateRelationship(npcId, {
      values: { affinity: newAffinity },
      addFlags: config.onPersuadeSuccessFlags,
    });

    const message = `Persuasion succeeded! NPC is convinced. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onSuccess(message);

    if (config.persuadeSuccessSceneId) {
      await context.onSceneOpen(config.persuadeSuccessSceneId, npcId);
    }

    return {
      success: true,
      message,
      data: { roll, successChance, affinityChange: config.persuadeAffinityReward },
    };
  } else {
    const newTrust = Math.max(0, trust - config.persuadeTrustPenalty);

    await session.updateRelationship(npcId, {
      values: { trust: newTrust },
      addFlags: config.onPersuadeFailFlags,
    });

    const message = `Persuasion failed. NPC is unconvinced and trust decreased. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onError(message);

    if (config.persuadeFailureSceneId) {
      await context.onSceneOpen(config.persuadeFailureSceneId, npcId);
    }

    return {
      success: false,
      message,
      data: { roll, successChance, trustChange: -config.persuadeTrustPenalty },
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
): Promise<InteractionResult> {
  const { session } = context;
  const affinity = session.getRelationshipValue(npcId, 'affinity');
  const chemistry = session.getRelationshipValue(npcId, 'chemistry');
  const trust = session.getRelationshipValue(npcId, 'trust');
  const intimacyLevel = session.getIntimacyLevel(npcId);

  // Build gating config from interaction config
  const gatingConfig: Partial<IntimacyGatingConfig> = {
    interactions: {
      seduction: {
        minimumAffinity: config.minAffinityForSeduction,
        minimumChemistry: config.minChemistryForSeduction,
        appropriateLevels: config.consentChecks && config.blockIfInappropriate
          ? undefined
          : [],
      },
    },
  };

  const seductionCheck = canAttemptSeduction(
    { affinity, chemistry, trust, levelId: intimacyLevel },
    gatingConfig
  );

  if (!seductionCheck.allowed) {
    const msg = seductionCheck.reason ?? 'Seduction not allowed';
    context.onError(msg);
    return { success: false, message: msg };
  }

  const successChance = calculateSeduceChance(
    chemistry, config.charmStat, config.difficulty, config.seductionChemistryBonus
  );

  const roll = Math.random();
  const success = roll < successChance;

  if (success) {
    const newAffinity = Math.min(100, affinity + config.seductionAffinityReward);
    const newChemistry = Math.min(100, chemistry + config.seductionChemistryReward);

    let newIntimacyLevel: string | undefined;
    if (config.advanceIntimacyOnSuccess) {
      newIntimacyLevel = advanceIntimacyLevel(intimacyLevel as string | undefined);
    }

    await session.updateRelationship(npcId, {
      values: { affinity: newAffinity, chemistry: newChemistry },
      intimacyLevel: newIntimacyLevel,
      addFlags: config.onSeduceSuccessFlags,
    });

    const intimacyMsg = newIntimacyLevel ? ` Intimacy advanced to: ${newIntimacyLevel}.` : '';
    const message = `Seduction succeeded!${intimacyMsg} (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onSuccess(message);

    if (config.seduceSuccessSceneId) {
      await context.onSceneOpen(config.seduceSuccessSceneId, npcId);
    }

    return {
      success: true,
      message,
      data: { roll, successChance, affinityChange: config.seductionAffinityReward, chemistryChange: config.seductionChemistryReward, newIntimacyLevel },
    };
  } else {
    const newTrust = Math.max(0, trust - config.seductionTrustPenalty);
    const newChemistry = Math.max(0, chemistry - config.seductionChemistryPenalty);

    await session.updateRelationship(npcId, {
      values: { trust: newTrust, chemistry: newChemistry },
      addFlags: config.onSeduceFailFlags,
    });

    const message = `Seduction failed. NPC rejected your advances. Trust and chemistry decreased. (${Math.round(successChance * 100)}% chance, rolled ${Math.round(roll * 100)})`;
    context.onError(message);

    if (config.seduceFailureSceneId) {
      await context.onSceneOpen(config.seduceFailureSceneId, npcId);
    }

    return {
      success: false,
      message,
      data: { roll, successChance, trustChange: -config.seductionTrustPenalty, chemistryChange: -config.seductionChemistryPenalty },
    };
  }
}
