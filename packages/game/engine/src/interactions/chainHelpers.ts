/**
 * Chain Helper Functions
 *
 * Utilities for creating common chain patterns
 */

import { createFromTemplate } from './templates';
import type { NpcInteractionDefinition } from '@pixsim7/shared.types';
import {
  createChain,
  createStep,
  type InteractionChain,
  type InteractionChainStep,
} from './chains';

/**
 * Create a quest chain (start → progress → complete)
 */
export function createQuestChain(
  questId: string,
  questName: string,
  npcId: number,
  npcName: string,
  options?: {
    rewardItemId?: string;
    rewardItemName?: string;
    progressSteps?: Array<{
      stepId: string;
      label: string;
      description: string;
      requiredFlags?: string[];
      waitMinutes?: number;
    }>;
  }
): InteractionChain {
  const steps: InteractionChainStep[] = [];

  // Step 1: Accept quest
  const startInteraction = createFromTemplate('questStart', {
    id: `${questId}:start`,
    label: `Accept: ${questName}`,
    targetNpcIds: [npcId],
    npcName,
    questId,
    questName,
  });

  if (startInteraction) {
    steps.push(createStep(`${questId}:start`, startInteraction));
  }

  // Progress steps (optional)
  if (options?.progressSteps) {
    for (let i = 0; i < options.progressSteps.length; i++) {
      const progressStep = options.progressSteps[i];

      const progressInteraction: NpcInteractionDefinition = {
        id: `${questId}:progress:${i + 1}`,
        label: progressStep.label,
        surface: 'dialogue',
        priority: 80,
        targetNpcIds: [npcId],
        gating: {
          requiredFlags: progressStep.requiredFlags,
        },
        outcome: {
          successMessage: progressStep.description,
          flagChanges: {
            set: {
              [`quest:${questId}:progress:${i + 1}`]: true,
            },
          },
          generationLaunch: {
            dialogueRequest: {
              programId: 'quest_progress_update',
            },
          },
        },
      };

      steps.push(
        createStep(`${questId}:progress:${i + 1}`, progressInteraction, {
          minWaitSeconds: progressStep.waitMinutes ? progressStep.waitMinutes * 60 : undefined,
          requiredFlags: progressStep.requiredFlags,
        })
      );
    }
  }

  // Final step: Complete quest
  const completeInteraction = createFromTemplate('questComplete', {
    id: `${questId}:complete`,
    label: `Complete: ${questName}`,
    targetNpcIds: [npcId],
    npcName,
    questId,
    questName,
    rewardItemId: options?.rewardItemId,
    rewardItemName: options?.rewardItemName,
  });

  if (completeInteraction) {
    steps.push(createStep(`${questId}:complete`, completeInteraction));
  }

  return createChain(`chain:quest:${questId}`, questName, npcId, steps, {
    description: `Quest chain: ${questName}`,
    category: 'quest',
    repeatable: false,
  });
}

/**
 * Create a romance progression chain
 */
export function createRomanceChain(
  npcId: number,
  npcName: string,
  stages: Array<{
    stageId: string;
    label: string;
    minAffinity?: number;
    minChemistry?: number;
    waitDays?: number;
    customOutcome?: NpcInteractionDefinition['outcome'];
  }>
): InteractionChain {
  const steps: InteractionChainStep[] = [];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];

    const interaction: NpcInteractionDefinition = {
      id: `${npcId}:romance:${stage.stageId}`,
      label: stage.label,
      icon: '💕',
      surface: 'scene',
      priority: 90,
      targetNpcIds: [npcId],
      gating: {
        relationship: {
          minAffinity: stage.minAffinity,
          minChemistry: stage.minChemistry,
        },
      },
      outcome: {
        successMessage: `Your relationship with ${npcName} deepens...`,
        relationshipDeltas: {
          affinity: 5,
          chemistry: 5,
          trust: 3,
        },
        flagChanges: {
          arcStages: {
            [`romance:${npcId}`]: stage.stageId,
          },
        },
        sceneLaunch: {
          sceneIntentId: `romance_${stage.stageId}`,
        },
        ...stage.customOutcome,
      },
    };

    steps.push(
      createStep(stage.stageId, interaction, {
        minWaitSeconds: stage.waitDays ? stage.waitDays * 86400 : undefined,
      })
    );
  }

  return createChain(`chain:romance:${npcId}`, `Romance with ${npcName}`, npcId, steps, {
    description: `Romance progression with ${npcName}`,
    category: 'romance',
    repeatable: false,
  });
}

/**
 * Create a friendship progression chain
 */
export function createFriendshipChain(
  npcId: number,
  npcName: string,
  milestones: Array<{
    milestoneId: string;
    label: string;
    minAffinity?: number;
    minTrust?: number;
    description: string;
  }>
): InteractionChain {
  const steps: InteractionChainStep[] = [];

  for (const milestone of milestones) {
    const interaction: NpcInteractionDefinition = {
      id: `${npcId}:friendship:${milestone.milestoneId}`,
      label: milestone.label,
      icon: '🤝',
      surface: 'dialogue',
      priority: 85,
      targetNpcIds: [npcId],
      gating: {
        relationship: {
          minAffinity: milestone.minAffinity,
          minTrust: milestone.minTrust,
        },
      },
      outcome: {
        successMessage: milestone.description,
        relationshipDeltas: {
          affinity: 3,
          trust: 3,
        },
        flagChanges: {
          set: {
            [`friendship:${npcId}:${milestone.milestoneId}`]: true,
          },
        },
        npcEffects: {
          createMemory: {
            topic: 'friendship_milestone',
            summary: milestone.description,
            importance: 'important',
            memoryType: 'long_term',
            tags: ['friendship', milestone.milestoneId],
          },
        },
        generationLaunch: {
          dialogueRequest: {
            programId: 'friendship_milestone',
          },
        },
      },
    };

    steps.push(createStep(milestone.milestoneId, interaction));
  }

  return createChain(`chain:friendship:${npcId}`, `Friendship with ${npcName}`, npcId, steps, {
    description: `Friendship milestones with ${npcName}`,
    category: 'friendship',
    repeatable: false,
  });
}

/**
 * Create a tutorial chain
 */
export function createTutorialChain(
  tutorialId: string,
  tutorialName: string,
  steps: Array<{
    stepId: string;
    label: string;
    description: string;
    requiredAction?: string;
    optional?: boolean;
  }>
): InteractionChain {
  const chainSteps: InteractionChainStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const tutStep = steps[i];

    const interaction: NpcInteractionDefinition = {
      id: `tutorial:${tutorialId}:${tutStep.stepId}`,
      label: tutStep.label,
      icon: '📚',
      surface: 'notification',
      priority: 100,
      gating: {
        requiredFlags: tutStep.requiredAction
          ? [`tutorial:${tutorialId}:action:${tutStep.requiredAction}`]
          : undefined,
      },
      outcome: {
        successMessage: tutStep.description,
        flagChanges: {
          set: {
            [`tutorial:${tutorialId}:step:${i + 1}`]: true,
          },
        },
      },
    };

    chainSteps.push(
      createStep(tutStep.stepId, interaction, {
        optional: tutStep.optional,
        autoAdvance: true,
      })
    );
  }

  return createChain(`chain:tutorial:${tutorialId}`, tutorialName, 0, chainSteps, {
    description: `Tutorial: ${tutorialName}`,
    category: 'tutorial',
    repeatable: false,
  });
}

/**
 * Create a story arc chain
 */
export function createStoryArcChain(
  arcId: string,
  arcName: string,
  npcId: number,
  npcName: string,
  beats: Array<{
    beatId: string;
    label: string;
    description: string;
    sceneIntentId?: string;
    requiredFlags?: string[];
    waitHours?: number;
    relationshipDelta?: {
      affinity?: number;
      trust?: number;
      chemistry?: number;
    };
  }>
): InteractionChain {
  const steps: InteractionChainStep[] = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const nextBeat = beats[i + 1];

    const interaction = createFromTemplate('storyBeat', {
      id: `${arcId}:${beat.beatId}`,
      label: beat.label,
      targetNpcIds: [npcId],
      npcName,
      arcId,
      arcStage: beat.beatId,
      nextStage: nextBeat?.beatId || 'completed',
      successMessage: beat.description,
      outcome: {
        relationshipDeltas: beat.relationshipDelta,
        sceneLaunch: beat.sceneIntentId
          ? {
              sceneIntentId: beat.sceneIntentId,
            }
          : undefined,
      },
    });

    if (interaction) {
      steps.push(
        createStep(beat.beatId, interaction, {
          requiredFlags: beat.requiredFlags,
          minWaitSeconds: beat.waitHours ? beat.waitHours * 3600 : undefined,
        })
      );
    }
  }

  return createChain(`chain:arc:${arcId}`, arcName, npcId, steps, {
    description: `Story arc: ${arcName}`,
    category: 'story',
    repeatable: false,
  });
}

/**
 * Create a repeatable daily quest chain
 */
export function createDailyQuestChain(
  questId: string,
  questName: string,
  npcId: number,
  npcName: string,
  taskDescription: string,
  rewardItemId: string,
  rewardItemName: string
): InteractionChain {
  const steps: InteractionChainStep[] = [];

  // Accept daily quest
  const acceptInteraction: NpcInteractionDefinition = {
    id: `daily:${questId}:accept`,
    label: `Accept Daily: ${questName}`,
    icon: '📅',
    surface: 'dialogue',
    priority: 80,
    targetNpcIds: [npcId],
    outcome: {
      successMessage: `${npcName}: "${taskDescription}"`,
      flagChanges: {
        set: {
          [`daily:${questId}:active`]: true,
        },
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'daily_quest_accept',
        },
      },
    },
  };

  steps.push(createStep(`${questId}:accept`, acceptInteraction));

  // Complete daily quest
  const completeInteraction: NpcInteractionDefinition = {
    id: `daily:${questId}:complete`,
    label: `Turn in Daily: ${questName}`,
    icon: '✅',
    surface: 'dialogue',
    priority: 90,
    targetNpcIds: [npcId],
    gating: {
      requiredFlags: [`daily:${questId}:task_done`],
    },
    outcome: {
      successMessage: `Completed daily quest: ${questName}`,
      relationshipDeltas: {
        affinity: 2,
        trust: 1,
      },
      inventoryChanges: {
        add: [{ itemId: rewardItemId, quantity: 1 }],
      },
      flagChanges: {
        delete: [`daily:${questId}:active`, `daily:${questId}:task_done`],
        increment: {
          [`daily:${questId}:completions`]: 1,
        },
      },
      generationLaunch: {
        dialogueRequest: {
          programId: 'daily_quest_complete',
        },
      },
    },
  };

  steps.push(createStep(`${questId}:complete`, completeInteraction));

  return createChain(`chain:daily:${questId}`, `Daily: ${questName}`, npcId, steps, {
    description: `Daily repeatable quest: ${questName}`,
    category: 'quest',
    repeatable: true,
    repeatCooldownSeconds: 86400, // 24 hours
  });
}

/**
 * Merge multiple chains for the same NPC
 */
export function mergeChains(...chains: InteractionChain[]): InteractionChain[] {
  return chains;
}

/**
 * Create a branching chain (choice-based)
 */
export function createBranchingChain(
  chainId: string,
  chainName: string,
  npcId: number,
  commonSteps: InteractionChainStep[],
  branches: Array<{
    branchId: string;
    branchName: string;
    triggerFlag: string;
    steps: InteractionChainStep[];
  }>
): InteractionChain[] {
  // Create main chain with common steps
  const mainChain = createChain(`${chainId}:main`, chainName, npcId, commonSteps, {
    category: 'story',
  });

  // Create a chain for each branch
  const branchChains = branches.map((branch) =>
    createChain(`${chainId}:${branch.branchId}`, branch.branchName, npcId, branch.steps, {
      description: `Branch: ${branch.branchName}`,
      category: 'story',
    })
  );

  return [mainChain, ...branchChains];
}
