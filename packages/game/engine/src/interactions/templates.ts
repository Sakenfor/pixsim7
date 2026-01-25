/**
 * NPC Interaction Templates
 *
 * Pre-built interaction templates for common patterns like gift-giving,
 * greetings, persuasion, etc. These can be instantiated and customized
 * for specific NPCs and scenarios.
 */

import type {
  InteractionDefinition,
  InteractionSurface,
  InteractionGating,
  InteractionOutcome,
  StatDelta,
  StatAxisGate,
  StatGating,
  FlagChanges,
  InventoryChanges,
} from '@pixsim7/shared.types';

/**
 * Template configuration for creating interactions
 */
export interface InteractionTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: 'social' | 'transactional' | 'narrative' | 'romantic' | 'hostile';
  /** Default surface */
  defaultSurface: InteractionSurface;
  /** Template function that creates the definition */
  create: (options: TemplateOptions) => InteractionDefinition;
}

/**
 * Options for customizing templates
 */
export interface TemplateOptions {
  /** Interaction ID (required) */
  id: string;
  /** Display label (required) */
  label: string;
  /** Target NPC IDs (optional, defaults to any) */
  targetIds?: number[];
  /** Icon (optional) */
  icon?: string;
  /** Override surface (optional) */
  surface?: InteractionSurface;
  /** Additional gating rules (optional) */
  gating?: Partial<InteractionGating>;
  /** Additional outcome effects (optional) */
  outcome?: Partial<InteractionOutcome>;
  /** Template-specific parameters */
  [key: string]: any;
}

const buildRelationshipStatGating = (
  gates: Array<Omit<StatAxisGate, 'definitionId' | 'entityType' | 'npcId'>>
): StatGating => ({
  allOf: gates.map((gate) => ({
    definitionId: 'relationships',
    entityType: 'npc',
    ...gate,
  })),
});

const relationshipStatDelta = (axes: Record<string, number>): StatDelta => ({
  packageId: 'core.relationships',
  definitionId: 'relationships',
  axes,
  entityType: 'npc',
});

// =============================================================================
// SOCIAL TEMPLATES
// =============================================================================

/**
 * Greeting interaction (affinity +2, trust +1)
 */
export const greetingTemplate: InteractionTemplate = {
  id: 'greeting',
  name: 'Greeting',
  description: 'Friendly greeting interaction',
  category: 'social',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '👋',
    surface: options.surface || 'dialogue',
    priority: 100,
    targetIds: options.targetIds,
    gating: {
      cooldownSeconds: 3600, // 1 hour
      ...options.gating,
    },
    outcome: {
      successMessage: `You greet ${options.npcName || 'them'} warmly.`,
      statDeltas: [
        relationshipStatDelta({
          affinity: 2,
          trust: 1,
        }),
      ],
      generationLaunch: {
        dialogueRequest: {
          programId: 'casual_greeting',
        },
      },
      ...options.outcome,
    },
    targetCanInitiate: true,
  }),
};

/**
 * Compliment interaction (affinity +3, chemistry +2)
 */
export const complimentTemplate: InteractionTemplate = {
  id: 'compliment',
  name: 'Compliment',
  description: 'Give a compliment to boost affinity and chemistry',
  category: 'social',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '💬',
    surface: options.surface || 'dialogue',
    priority: 80,
    targetIds: options.targetIds,
    gating: {
      statGating: buildRelationshipStatGating([
        { axis: 'affinity', minValue: 20 },
      ]),
      cooldownSeconds: 7200, // 2 hours
      ...options.gating,
    },
    outcome: {
      successMessage: `${options.npcName || 'They'} smile at your compliment.`,
      statDeltas: [
        relationshipStatDelta({
          affinity: 3,
          chemistry: 2,
        }),
      ],
      targetEffects: {
        effects: [
          {
            type: 'npc.trigger_emotion',
            payload: {
              emotion: 'happy',
              intensity: 0.6,
              durationSeconds: 1800,
            },
          },
        ],
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'respond_to_compliment',
        },
      },
      ...options.outcome,
    },
  }),
};

/**
 * Ask about day (trust +1, creates memory)
 */
export const askAboutDayTemplate: InteractionTemplate = {
  id: 'ask_about_day',
  name: 'Ask About Day',
  description: 'Show interest in their day, building trust',
  category: 'social',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '💭',
    surface: options.surface || 'dialogue',
    priority: 70,
    targetIds: options.targetIds,
    gating: {
      statGating: buildRelationshipStatGating([
        { axis: 'affinity', minValue: 10 },
      ]),
      cooldownSeconds: 14400, // 4 hours
      ...options.gating,
    },
    outcome: {
      successMessage: `${options.npcName || 'They'} share how their day went.`,
      statDeltas: [
        relationshipStatDelta({
          trust: 1,
          affinity: 1,
        }),
      ],
      targetEffects: {
        effects: [
          {
            type: 'npc.create_memory',
            payload: {
              topic: 'daily_conversation',
              summary: 'Player asked about my day',
              importance: 'normal',
              memoryType: 'short_term',
            },
          },
        ],
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'talk_about_day',
        },
      },
      ...options.outcome,
    },
  }),
};

// =============================================================================
// TRANSACTIONAL TEMPLATES
// =============================================================================

/**
 * Gift giving interaction (affinity +5, requires item)
 */
export const giftGivingTemplate: InteractionTemplate = {
  id: 'gift_giving',
  name: 'Gift Giving',
  description: 'Give an item as a gift',
  category: 'transactional',
  defaultSurface: 'inline',
  create: (options: TemplateOptions) => {
    const itemId = options.itemId as string;
    const itemName = options.itemName as string || 'gift';
    const affinityBoost = (options.affinityBoost as number) || 5;

    return {
      id: options.id,
      label: options.label,
      icon: options.icon || '🎁',
      surface: options.surface || 'inline',
      priority: 90,
      targetIds: options.targetIds,
      gating: {
        requiredFlags: [`has_item:${itemId}`],
        statGating: buildRelationshipStatGating([
          { axis: 'affinity', minValue: 15 },
        ]),
        ...options.gating,
      },
      outcome: {
        successMessage: `${options.npcName || 'They'} gratefully accept${options.npcName ? 's' : ''} your ${itemName}.`,
        statDeltas: [
          relationshipStatDelta({
            affinity: affinityBoost,
            trust: 2,
          }),
        ],
        inventoryChanges: {
          remove: [{ itemId, quantity: 1 }],
        },
        targetEffects: {
          effects: [
            {
              type: 'npc.create_memory',
              payload: {
                topic: 'gift_received',
                summary: `Player gave me ${itemName}`,
                importance: 'important',
                memoryType: 'long_term',
                tags: ['gift', itemId],
              },
            },
            {
              type: 'npc.trigger_emotion',
              payload: {
                emotion: 'happy',
                intensity: 0.8,
                durationSeconds: 3600,
              },
            },
          ],
        },
        ...options.outcome,
      },
    };
  },
};

/**
 * Trade interaction (exchange items)
 */
export const tradeTemplate: InteractionTemplate = {
  id: 'trade',
  name: 'Trade',
  description: 'Exchange items with NPC',
  category: 'transactional',
  defaultSurface: 'menu',
  create: (options: TemplateOptions) => {
    const giveItemId = options.giveItemId as string;
    const receiveItemId = options.receiveItemId as string;
    const giveItemName = options.giveItemName as string || 'item';
    const receiveItemName = options.receiveItemName as string || 'item';

    return {
      id: options.id,
      label: options.label,
      icon: options.icon || '🔄',
      surface: options.surface || 'menu',
      priority: 75,
      targetIds: options.targetIds,
      gating: {
        requiredFlags: [`has_item:${giveItemId}`],
        ...options.gating,
      },
      outcome: {
        successMessage: `You trade ${giveItemName} for ${receiveItemName}.`,
        inventoryChanges: {
          remove: [{ itemId: giveItemId, quantity: 1 }],
          add: [{ itemId: receiveItemId, quantity: 1 }],
        },
        flagChanges: {
          set: {
            [`traded_with:${options.npcName}`]: true,
          },
        },
        ...options.outcome,
      },
    };
  },
};

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

/**
 * Quest start interaction (sets quest flags)
 */
export const questStartTemplate: InteractionTemplate = {
  id: 'quest_start',
  name: 'Quest Start',
  description: 'Begin a quest with this NPC',
  category: 'narrative',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => {
    const questId = options.questId as string;
    const questName = options.questName as string || 'Quest';

    return {
      id: options.id,
      label: options.label,
      icon: options.icon || '📜',
      surface: options.surface || 'dialogue',
      priority: 95,
      targetIds: options.targetIds,
      gating: {
        statGating: buildRelationshipStatGating([
          { axis: 'affinity', minValue: 25 },
        ]),
        forbiddenFlags: [`quest:${questId}:started`],
        ...options.gating,
      },
      outcome: {
        successMessage: `You accept the quest: ${questName}`,
        flagChanges: {
          questUpdates: {
            [questId]: 'active',
          },
          set: {
            [`quest:${questId}:started`]: true,
          },
        },
        statDeltas: [
          relationshipStatDelta({
            trust: 3,
          }),
        ],
        targetEffects: {
          effects: [
            {
              type: 'npc.create_memory',
              payload: {
                topic: 'quest_given',
                summary: `Gave player quest: ${questName}`,
                importance: 'important',
                memoryType: 'long_term',
                tags: ['quest', questId],
              },
            },
          ],
        },
        generationLaunch: {
          dialogueRequest: {
            programId: 'quest_introduction',
          },
        },
        ...options.outcome,
      },
    };
  },
};

/**
 * Quest complete interaction
 */
export const questCompleteTemplate: InteractionTemplate = {
  id: 'quest_complete',
  name: 'Quest Complete',
  description: 'Turn in a completed quest',
  category: 'narrative',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => {
    const questId = options.questId as string;
    const questName = options.questName as string || 'Quest';
    const rewardItemId = options.rewardItemId as string | undefined;
    const rewardItemName = options.rewardItemName as string || 'reward';

    return {
      id: options.id,
      label: options.label,
      icon: options.icon || '✅',
      surface: options.surface || 'dialogue',
      priority: 100,
      targetIds: options.targetIds,
      gating: {
        requiredFlags: [`quest:${questId}:completed`],
        forbiddenFlags: [`quest:${questId}:rewarded`],
        ...options.gating,
      },
      outcome: {
        successMessage: `Quest completed: ${questName}`,
        flagChanges: {
          questUpdates: {
            [questId]: 'completed',
          },
          set: {
            [`quest:${questId}:rewarded`]: true,
          },
        },
        inventoryChanges: rewardItemId
          ? {
              add: [{ itemId: rewardItemId, quantity: 1 }],
            }
          : undefined,
        statDeltas: [
          relationshipStatDelta({
            affinity: 5,
            trust: 5,
          }),
        ],
        targetEffects: {
          effects: [
            {
              type: 'npc.create_memory',
              payload: {
                topic: 'quest_completed',
                summary: `Player completed quest: ${questName}`,
                importance: 'critical',
                memoryType: 'long_term',
                tags: ['quest', questId, 'completed'],
              },
            },
            {
              type: 'npc.trigger_emotion',
              payload: {
                emotion: 'happy',
                intensity: 0.9,
                durationSeconds: 3600,
              },
            },
          ],
        },
        generationLaunch: {
          dialogueRequest: {
            programId: 'quest_reward',
          },
        },
        ...options.outcome,
      },
    };
  },
};

/**
 * Story beat interaction (advances narrative arc)
 */
export const storyBeatTemplate: InteractionTemplate = {
  id: 'story_beat',
  name: 'Story Beat',
  description: 'Advance a narrative arc',
  category: 'narrative',
  defaultSurface: 'scene',
  create: (options: TemplateOptions) => {
    const arcId = options.arcId as string;
    const arcStage = options.arcStage as string;
    const nextStage = options.nextStage as string;

    return {
      id: options.id,
      label: options.label,
      icon: options.icon || '🎭',
      surface: options.surface || 'scene',
      priority: 100,
      targetIds: options.targetIds,
      gating: {
        requiredFlags: [`arc:${arcId}:stage:${arcStage}`],
        ...options.gating,
      },
      outcome: {
        successMessage: options.successMessage as string || 'The story continues...',
        flagChanges: {
          arcStages: {
            [arcId]: nextStage,
          },
          triggerEvents: [`${arcId}:${nextStage}`],
        },
        statDeltas: [
          relationshipStatDelta({
            affinity: 3,
            trust: 2,
          }),
        ],
        sceneLaunch: {
          sceneIntentId: `${arcId}_${nextStage}`,
        },
        ...options.outcome,
      },
    };
  },
};

// =============================================================================
// ROMANTIC TEMPLATES
// =============================================================================

/**
 * Flirt interaction (chemistry +3, requires medium affinity)
 */
export const flirtTemplate: InteractionTemplate = {
  id: 'flirt',
  name: 'Flirt',
  description: 'Flirtatious interaction',
  category: 'romantic',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '😊',
    surface: options.surface || 'dialogue',
    priority: 85,
    targetIds: options.targetIds,
    gating: {
      statGating: buildRelationshipStatGating([
        { axis: 'affinity', minValue: 40 },
        { axis: 'chemistry', minValue: 20 },
      ]),
      cooldownSeconds: 3600,
      ...options.gating,
    },
    outcome: {
      successMessage: `${options.npcName || 'They'} respond${options.npcName ? 's' : ''} playfully to your flirting.`,
      statDeltas: [
        relationshipStatDelta({
          chemistry: 3,
          affinity: 2,
        }),
      ],
      targetEffects: {
        effects: [
          {
            type: 'npc.trigger_emotion',
            payload: {
              emotion: 'excited',
              intensity: 0.7,
              durationSeconds: 1800,
            },
          },
        ],
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'flirtatious_response',
        },
      },
      ...options.outcome,
    },
  }),
};

/**
 * Date invitation (chemistry +5, launches date scene)
 */
export const dateInvitationTemplate: InteractionTemplate = {
  id: 'date_invitation',
  name: 'Date Invitation',
  description: 'Invite NPC on a date',
  category: 'romantic',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '💕',
    surface: options.surface || 'dialogue',
    priority: 90,
    targetIds: options.targetIds,
    gating: {
      statGating: buildRelationshipStatGating([
        { axis: 'affinity', minValue: 60, minTierId: 'friend' },
        { axis: 'chemistry', minValue: 50 },
      ]),
      timeOfDay: {
        periods: ['afternoon', 'evening'],
      },
      cooldownSeconds: 86400, // 24 hours
      ...options.gating,
    },
    outcome: {
      successMessage: `${options.npcName || 'They'} agree${options.npcName ? 's' : ''} to go on a date with you!`,
      statDeltas: [
        relationshipStatDelta({
          chemistry: 5,
          affinity: 3,
          trust: 2,
        }),
      ],
      flagChanges: {
        set: {
          [`date_with:${options.npcName}:scheduled`]: true,
        },
      },
      sceneLaunch: {
        sceneIntentId: 'romantic_date',
      },
      ...options.outcome,
    },
  }),
};

// =============================================================================
// HOSTILE TEMPLATES
// =============================================================================

/**
 * Insult interaction (affinity -3, tension +2)
 */
export const insultTemplate: InteractionTemplate = {
  id: 'insult',
  name: 'Insult',
  description: 'Insulting or hostile remark',
  category: 'hostile',
  defaultSurface: 'dialogue',
  create: (options: TemplateOptions) => ({
    id: options.id,
    label: options.label,
    icon: options.icon || '😠',
    surface: options.surface || 'dialogue',
    priority: 60,
    targetIds: options.targetIds,
    gating: {
      ...options.gating,
    },
    outcome: {
      successMessage: `${options.npcName || 'They'} look${options.npcName ? 's' : ''} offended.`,
      statDeltas: [
        relationshipStatDelta({
          affinity: -3,
          trust: -2,
          tension: 2,
        }),
      ],
      targetEffects: {
        effects: [
          {
            type: 'npc.trigger_emotion',
            payload: {
              emotion: 'angry',
              intensity: 0.8,
              durationSeconds: 3600,
            },
          },
          {
            type: 'npc.create_memory',
            payload: {
              topic: 'conflict',
              summary: 'Player insulted me',
              importance: 'important',
              memoryType: 'long_term',
              tags: ['conflict', 'negative'],
            },
          },
        ],
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'react_to_insult',
        },
      },
      ...options.outcome,
    },
  }),
};

// =============================================================================
// TEMPLATE LIBRARY
// =============================================================================

export const interactionTemplates: Record<string, InteractionTemplate> = {
  greeting: greetingTemplate,
  compliment: complimentTemplate,
  askAboutDay: askAboutDayTemplate,
  giftGiving: giftGivingTemplate,
  trade: tradeTemplate,
  questStart: questStartTemplate,
  questComplete: questCompleteTemplate,
  storyBeat: storyBeatTemplate,
  flirt: flirtTemplate,
  dateInvitation: dateInvitationTemplate,
  insult: insultTemplate,
};

/**
 * Get a template by ID
 */
export function getTemplate(id: string): InteractionTemplate | undefined {
  return interactionTemplates[id];
}

/**
 * Get all templates in a category
 */
export function getTemplatesByCategory(
  category: InteractionTemplate['category']
): InteractionTemplate[] {
  return Object.values(interactionTemplates).filter(
    (t) => t.category === category
  );
}

/**
 * Create an interaction from a template
 */
export function createFromTemplate(
  templateId: string,
  options: TemplateOptions
): InteractionDefinition | null {
  const template = getTemplate(templateId);
  if (!template) {
    console.error(`Template ${templateId} not found`);
    return null;
  }

  return template.create(options);
}
