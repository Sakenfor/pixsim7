/**
 * Helper utilities for working with interaction templates
 */

import type { NpcInteractionDefinition } from '@pixsim7/types';
import {
  createFromTemplate,
  getTemplate,
  getTemplatesByCategory,
  type TemplateOptions,
  type InteractionTemplate,
} from './templates';

/**
 * Batch create multiple interactions from templates
 */
export function createInteractionsFromTemplates(
  configs: Array<{
    templateId: string;
    options: TemplateOptions;
  }>
): NpcInteractionDefinition[] {
  const interactions: NpcInteractionDefinition[] = [];

  for (const { templateId, options } of configs) {
    const interaction = createFromTemplate(templateId, options);
    if (interaction) {
      interactions.push(interaction);
    }
  }

  return interactions;
}

/**
 * Create a standard set of social interactions for an NPC
 */
export function createStandardSocialSet(npcId: number, npcName: string): NpcInteractionDefinition[] {
  return createInteractionsFromTemplates([
    {
      templateId: 'greeting',
      options: {
        id: `${npcId}:greeting`,
        label: `Greet ${npcName}`,
        targetNpcIds: [npcId],
        npcName,
      },
    },
    {
      templateId: 'compliment',
      options: {
        id: `${npcId}:compliment`,
        label: `Compliment ${npcName}`,
        targetNpcIds: [npcId],
        npcName,
      },
    },
    {
      templateId: 'askAboutDay',
      options: {
        id: `${npcId}:ask_day`,
        label: `Ask ${npcName} about their day`,
        targetNpcIds: [npcId],
        npcName,
      },
    },
  ]);
}

/**
 * Create a romantic interaction set for an NPC
 */
export function createRomanticSet(npcId: number, npcName: string): NpcInteractionDefinition[] {
  return createInteractionsFromTemplates([
    {
      templateId: 'flirt',
      options: {
        id: `${npcId}:flirt`,
        label: `Flirt with ${npcName}`,
        targetNpcIds: [npcId],
        npcName,
      },
    },
    {
      templateId: 'dateInvitation',
      options: {
        id: `${npcId}:date_invite`,
        label: `Ask ${npcName} on a date`,
        targetNpcIds: [npcId],
        npcName,
      },
    },
  ]);
}

/**
 * Create gift-giving interaction for a specific item
 */
export function createGiftInteraction(
  npcId: number,
  npcName: string,
  itemId: string,
  itemName: string,
  affinityBoost: number = 5
): NpcInteractionDefinition | null {
  return createFromTemplate('giftGiving', {
    id: `${npcId}:gift:${itemId}`,
    label: `Give ${itemName} to ${npcName}`,
    targetNpcIds: [npcId],
    npcName,
    itemId,
    itemName,
    affinityBoost,
  });
}

/**
 * Create a quest interaction pair (start + complete)
 */
export function createQuestInteractions(
  npcId: number,
  npcName: string,
  questId: string,
  questName: string,
  rewardItemId?: string,
  rewardItemName?: string
): NpcInteractionDefinition[] {
  const interactions: NpcInteractionDefinition[] = [];

  const start = createFromTemplate('questStart', {
    id: `${npcId}:quest:${questId}:start`,
    label: `Accept ${questName}`,
    targetNpcIds: [npcId],
    npcName,
    questId,
    questName,
  });

  const complete = createFromTemplate('questComplete', {
    id: `${npcId}:quest:${questId}:complete`,
    label: `Complete ${questName}`,
    targetNpcIds: [npcId],
    npcName,
    questId,
    questName,
    rewardItemId,
    rewardItemName,
  });

  if (start) interactions.push(start);
  if (complete) interactions.push(complete);

  return interactions;
}

/**
 * Create a trade interaction
 */
export function createTradeInteraction(
  npcId: number,
  npcName: string,
  giveItemId: string,
  giveItemName: string,
  receiveItemId: string,
  receiveItemName: string
): NpcInteractionDefinition | null {
  return createFromTemplate('trade', {
    id: `${npcId}:trade:${giveItemId}_for_${receiveItemId}`,
    label: `Trade ${giveItemName} for ${receiveItemName}`,
    targetNpcIds: [npcId],
    npcName,
    giveItemId,
    giveItemName,
    receiveItemId,
    receiveItemName,
  });
}

/**
 * Create story arc interactions for all stages
 */
export function createStoryArcInteractions(
  npcId: number,
  npcName: string,
  arcId: string,
  stages: Array<{
    stage: string;
    label: string;
    nextStage: string;
    successMessage?: string;
  }>
): NpcInteractionDefinition[] {
  return stages
    .map((stage) =>
      createFromTemplate('storyBeat', {
        id: `${npcId}:arc:${arcId}:${stage.stage}`,
        label: stage.label,
        targetNpcIds: [npcId],
        npcName,
        arcId,
        arcStage: stage.stage,
        nextStage: stage.nextStage,
        successMessage: stage.successMessage,
      })
    )
    .filter((i): i is NpcInteractionDefinition => i !== null);
}

/**
 * Create a full interaction suite for an NPC
 */
export function createFullInteractionSuite(
  npcId: number,
  npcName: string,
  options?: {
    includeSocial?: boolean;
    includeRomantic?: boolean;
    gifts?: Array<{ itemId: string; itemName: string; affinityBoost?: number }>;
    trades?: Array<{
      giveItemId: string;
      giveItemName: string;
      receiveItemId: string;
      receiveItemName: string;
    }>;
    quests?: Array<{
      questId: string;
      questName: string;
      rewardItemId?: string;
      rewardItemName?: string;
    }>;
  }
): NpcInteractionDefinition[] {
  const interactions: NpcInteractionDefinition[] = [];

  // Social interactions
  if (options?.includeSocial !== false) {
    interactions.push(...createStandardSocialSet(npcId, npcName));
  }

  // Romantic interactions
  if (options?.includeRomantic) {
    interactions.push(...createRomanticSet(npcId, npcName));
  }

  // Gift interactions
  if (options?.gifts) {
    for (const gift of options.gifts) {
      const interaction = createGiftInteraction(
        npcId,
        npcName,
        gift.itemId,
        gift.itemName,
        gift.affinityBoost
      );
      if (interaction) interactions.push(interaction);
    }
  }

  // Trade interactions
  if (options?.trades) {
    for (const trade of options.trades) {
      const interaction = createTradeInteraction(
        npcId,
        npcName,
        trade.giveItemId,
        trade.giveItemName,
        trade.receiveItemId,
        trade.receiveItemName
      );
      if (interaction) interactions.push(interaction);
    }
  }

  // Quest interactions
  if (options?.quests) {
    for (const quest of options.quests) {
      interactions.push(
        ...createQuestInteractions(
          npcId,
          npcName,
          quest.questId,
          quest.questName,
          quest.rewardItemId,
          quest.rewardItemName
        )
      );
    }
  }

  return interactions;
}

/**
 * Get template metadata (useful for UI tools)
 */
export function getTemplateMetadata(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  defaultSurface: string;
}> {
  const templates = Object.values(getTemplatesByCategory('social'))
    .concat(getTemplatesByCategory('transactional'))
    .concat(getTemplatesByCategory('narrative'))
    .concat(getTemplatesByCategory('romantic'))
    .concat(getTemplatesByCategory('hostile'));

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    defaultSurface: t.defaultSurface,
  }));
}

/**
 * Validate template options (basic validation)
 */
export function validateTemplateOptions(
  templateId: string,
  options: TemplateOptions
): { valid: boolean; errors: string[] } {
  const template = getTemplate(templateId);
  const errors: string[] = [];

  if (!template) {
    errors.push(`Template ${templateId} not found`);
    return { valid: false, errors };
  }

  if (!options.id) {
    errors.push('Interaction ID is required');
  }

  if (!options.label) {
    errors.push('Label is required');
  }

  // Template-specific validation
  switch (templateId) {
    case 'giftGiving':
      if (!options.itemId) errors.push('itemId is required for gift giving');
      if (!options.itemName) errors.push('itemName is required for gift giving');
      break;

    case 'trade':
      if (!options.giveItemId) errors.push('giveItemId is required for trade');
      if (!options.receiveItemId) errors.push('receiveItemId is required for trade');
      break;

    case 'questStart':
    case 'questComplete':
      if (!options.questId) errors.push('questId is required for quest interactions');
      if (!options.questName) errors.push('questName is required for quest interactions');
      break;

    case 'storyBeat':
      if (!options.arcId) errors.push('arcId is required for story beat');
      if (!options.arcStage) errors.push('arcStage is required for story beat');
      if (!options.nextStage) errors.push('nextStage is required for story beat');
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
