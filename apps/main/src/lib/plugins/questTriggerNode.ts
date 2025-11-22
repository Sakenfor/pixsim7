/**
 * Quest Trigger Node Plugin
 *
 * Arc-scoped node type for triggering quest events at specific points in the story.
 * Demonstrates scope-based organization and rich data structures.
 *
 * USAGE:
 * 1. Import this file in your app initialization
 * 2. Call registerQuestTriggerNode() once at startup
 * 3. The 'quest-trigger' node will appear in the arc graph
 *
 * @example
 * ```typescript
 * import { registerQuestTriggerNode } from './lib/plugins/questTriggerNode';
 *
 * // In your app initialization
 * registerQuestTriggerNode();
 * ```
 */

import { nodeTypeRegistry } from '@pixsim7/shared.types';

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
 * Register the quest trigger node type
 * Call this once during app initialization
 */
let questTriggerNodeRegistered = false;

export function registerQuestTriggerNode() {
  if (questTriggerNodeRegistered) {
    return;
  }
  questTriggerNodeRegistered = true;

  nodeTypeRegistry.register<QuestTriggerNodeData>({
    // Identity
    id: 'quest-trigger',
    name: 'Quest Trigger',
    description: 'Start, complete, or update quest progress',
    icon: '📜',

    // Organization
    category: 'action',
    scope: 'arc', // This is an arc-level node (affects quest progression across scenes)

    // Behavior
    userCreatable: true,

    // Styling
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',

    // Default data when creating new node
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

    // Editor component (will be loaded from InspectorPanel)
    editorComponent: 'QuestTriggerEditor',

    // Renderer component for graph view
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

    // Performance optimization: Lazy loading
    // Preload priority: Medium-high (quests are important)
    preloadPriority: 7,
  });

  console.log('✓ Registered quest-trigger node type');
}
