/**
 * Quest Trigger Node Type Plugin
 *
 * Comprehensive example demonstrating:
 * - Custom node type with rich data structure
 * - Scope-based organization (arc level)
 * - Lazy loading with preload priority
 * - Renderer plugin integration
 * - Validation and schema
 *
 * Use case: Trigger quests at specific points in the story.
 */

import type { NodeTypeDefinition } from '@pixsim7/types';

/**
 * Quest objective structure
 */
export interface QuestObjective {
  id: string;
  description: string;
  optional: boolean;
  completionFlag?: string; // Session flag to check
}

/**
 * Quest trigger node data structure
 */
export interface QuestTriggerNodeData {
  /** Quest ID to activate */
  questId: string;

  /** Quest title */
  questTitle: string;

  /** Quest description */
  questDescription: string;

  /** Quest objectives */
  objectives: QuestObjective[];

  /** Action type */
  action: 'start' | 'complete' | 'fail' | 'update';

  /** Target node on success */
  successTargetNodeId?: string;

  /** Conditions to check before triggering */
  conditions?: {
    requiredFlags?: string[]; // All must be true
    forbiddenFlags?: string[]; // None must be true
    minLevel?: number;
  };

  /** Rewards */
  rewards?: {
    experience?: number;
    items?: string[];
    unlockFlags?: string[];
  };
}

/**
 * Quest Trigger node type definition
 *
 * This is a "stub" definition for lazy loading.
 * The full definition with all logic would be loaded on demand.
 */
export const questTriggerNodeType: NodeTypeDefinition<QuestTriggerNodeData> = {
  // Identity
  id: 'quest-trigger',
  name: 'Quest Trigger',
  description: 'Start, complete, or update quest progress',
  icon: '📜',

  // Organization
  category: 'action',
  scope: 'arc', // This is an arc-level node (affects quest progression across scenes)

  // Default data when creating a new node
  defaultData: {
    questId: '',
    questTitle: 'New Quest',
    questDescription: 'Quest description',
    objectives: [
      {
        id: 'obj1',
        description: 'Complete the objective',
        optional: false,
        completionFlag: 'quest_objective_1_complete',
      },
    ],
    action: 'start',
    conditions: {
      requiredFlags: [],
      forbiddenFlags: [],
    },
    rewards: {
      experience: 100,
      items: [],
      unlockFlags: [],
    },
  },

  // JSON schema for validation
  schema: {
    type: 'object',
    properties: {
      questId: { type: 'string', minLength: 1 },
      questTitle: { type: 'string', minLength: 1 },
      questDescription: { type: 'string' },
      action: { type: 'string', enum: ['start', 'complete', 'fail', 'update'] },
      objectives: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            optional: { type: 'boolean' },
            completionFlag: { type: 'string' },
          },
          required: ['id', 'description', 'optional'],
        },
      },
    },
    required: ['questId', 'questTitle', 'action'],
  },

  // Component names for lazy loading
  editorComponent: 'QuestTriggerEditor',
  rendererComponent: 'QuestTriggerRenderer',

  // Custom validation
  validate(data: QuestTriggerNodeData): string | null {
    if (!data.questId || data.questId.trim() === '') {
      return 'Quest ID is required';
    }

    if (!data.questTitle || data.questTitle.trim() === '') {
      return 'Quest title is required';
    }

    if (data.objectives.length === 0) {
      return 'At least one objective is required';
    }

    // Check for duplicate objective IDs
    const objectiveIds = data.objectives.map(obj => obj.id);
    const uniqueIds = new Set(objectiveIds);
    if (objectiveIds.length !== uniqueIds.size) {
      return 'Duplicate objective IDs found';
    }

    return null;
  },

  // UI properties
  userCreatable: true,
  color: 'text-purple-700 dark:text-purple-300',
  bgColor: 'bg-purple-100 dark:bg-purple-900/30',

  // Performance optimization: Lazy loading
  // The full definition with heavy dependencies would be in a separate file
  // Uncomment to enable lazy loading:
  /*
  loader: async () => {
    const module = await import('./quest-trigger.full');
    return module.questTriggerNodeTypeFull;
  },
  */

  // Preload priority: Medium-high (quests are important)
  preloadPriority: 7,
};

/**
 * Example: Full definition for lazy loading
 *
 * In production, this would be in a separate file (quest-trigger.full.ts)
 * to avoid loading heavy dependencies until needed.
 */
/*
export const questTriggerNodeTypeFull: NodeTypeDefinition<QuestTriggerNodeData> = {
  ...questTriggerNodeType,

  // Additional heavy logic that we don't want to load immediately
  validate(data: QuestTriggerNodeData): string | null {
    // Call base validation
    const baseError = questTriggerNodeType.validate?.(data);
    if (baseError) return baseError;

    // Advanced validation with heavy dependencies
    // (e.g., validate against quest database, check flag names, etc.)

    return null;
  },
};
*/
