/**
 * Seduction Node Plugin
 *
 * Example custom node type for multi-stage NPC seduction interactions.
 * Demonstrates how to create custom scene nodes using the NodeTypeRegistry.
 *
 * USAGE:
 * 1. Import this file in your app initialization
 * 2. Call registerSeductionNode() once at startup
 * 3. The 'seduction' node will appear in the scene builder
 *
 * @example
 * ```typescript
 * import { registerSeductionNode } from './lib/plugins/seductionNode';
 *
 * // In your app initialization
 * registerSeductionNode();
 * ```
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

/**
 * Seduction stage definition
 * Represents one step in the multi-stage seduction process
 */
export interface SeductionStage {
  /** Stage ID (e.g., 'flirt', 'touch', 'intimacy') */
  id: string;

  /** Display name for this stage */
  name: string;

  /** Description shown to player */
  description: string;

  /** Minimum affinity required to succeed at this stage (0-100) */
  requiredAffinity: number;

  /** Success message */
  successMessage?: string;

  /** Failure message */
  failureMessage?: string;
}

/**
 * Seduction node data structure
 * Stored in node.metadata
 */
export interface SeductionNodeData {
  /** Ordered list of seduction stages */
  stages: SeductionStage[];

  /** Current stage index (runtime state) */
  currentStage?: number;

  /** Target node ID on complete success */
  successTargetNodeId?: string;

  /** Target node ID on failure at any stage */
  failureTargetNodeId?: string;

  /** NPC affinity check (can reference session flags) */
  affinityCheckFlag?: string; // e.g., "npc_emma_affinity"

  /** Whether failure is permanent or can retry */
  allowRetry?: boolean;
}

/**
 * Default seduction stages
 * Good starting template for most seduction scenarios
 */
export const DEFAULT_SEDUCTION_STAGES: SeductionStage[] = [
  {
    id: 'flirt',
    name: 'Flirt',
    description: 'Light flirting and compliments',
    requiredAffinity: 20,
    successMessage: 'They smile warmly at your attention',
    failureMessage: 'They seem uncomfortable with your advances',
  },
  {
    id: 'touch',
    name: 'Physical Touch',
    description: 'Light physical contact - hand holding, caressing',
    requiredAffinity: 50,
    successMessage: 'They respond positively to your touch',
    failureMessage: 'They pull away from your touch',
  },
  {
    id: 'intimacy',
    name: 'Intimacy',
    description: 'Intimate physical contact',
    requiredAffinity: 80,
    successMessage: 'They eagerly accept your advance',
    failureMessage: 'They push you away - this went too far',
  },
];

/**
 * Register the seduction node type
 * Call this once during app initialization
 */
let seductionNodeRegistered = false;

export async function registerSeductionNode(): Promise<void> {
  if (seductionNodeRegistered) {
    return;
  }
  seductionNodeRegistered = true;

  const nodeDefinition = {
    // Identity
    id: 'seduction',
    name: 'Seduction',
    description: 'Multi-stage NPC seduction with affinity checks',
    icon: 'heart',
    category: 'custom',
    scope: 'scene', // Scene-level interaction node

    // Behavior
    userCreatable: true,

    // Styling
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',

    // Default data when creating new node
    defaultData: {
      stages: DEFAULT_SEDUCTION_STAGES,
      currentStage: 0,
      successTargetNodeId: '',
      failureTargetNodeId: '',
      affinityCheckFlag: 'npc_affinity',
      allowRetry: false,
    },

    // Editor component (will be loaded from InspectorPanel)
    editorComponent: 'SeductionNodeEditor',

    // Renderer component for graph view
    rendererComponent: 'SeductionNodeRenderer',

    // Performance optimization: Preload priority
    // Seduction is a common plugin node in scene graphs
    preloadPriority: 8,

    // Optional: Validation
    validate: (data: SeductionNodeData) => {
      if (!data.stages || data.stages.length === 0) {
        return 'Seduction node must have at least one stage';
      }

      // Ensure affinity requirements are progressive
      for (let i = 1; i < data.stages.length; i++) {
        if (data.stages[i].requiredAffinity < data.stages[i - 1].requiredAffinity) {
          return `Stage "${data.stages[i].name}" has lower affinity requirement than previous stage`;
        }
      }

      return null; // Valid
    },
  };

  await registerPluginDefinition({
    id: nodeDefinition.id,
    family: 'node-type',
    origin: 'plugin-dir',
    source: 'sandbox',
    plugin: nodeDefinition,
  });

  console.log('[NodeType] Registered seduction node type');
}

/**
 * EXAMPLE USAGE IN A SCENE
 *
 * Here's how you'd use this node type in your scene builder:
 *
 * ```typescript
 * import { registerSeductionNode } from './plugins/seductionNode';
 *
 * // 1. Register the node type (once at app startup)
 * registerSeductionNode();
 *
 * // 2. In your scene, create a seduction node
 * const seductionNode = {
 *   id: 'seduce_emma',
 *   type: 'seduction',
 *   metadata: {
 *     label: 'Seduce Emma',
 *     seductionConfig: {
 *       stages: [
 *         {
 *           id: 'flirt',
 *           name: 'Flirt',
 *           description: 'Compliment Emma and make light conversation',
 *           requiredAffinity: 25,
 *           successMessage: 'Emma giggles and plays with her hair',
 *           failureMessage: 'Emma politely excuses herself',
 *         },
 *         {
 *           id: 'kiss',
 *           name: 'Kiss',
 *           description: 'Lean in for a kiss',
 *           requiredAffinity: 60,
 *           successMessage: 'Emma kisses you back passionately',
 *           failureMessage: 'Emma turns her head away',
 *         },
 *       ],
 *       affinityCheckFlag: 'emma_affinity',
 *       successTargetNodeId: 'romance_success_scene',
 *       failureTargetNodeId: 'rejection_scene',
 *       allowRetry: false,
 *     }
 *   }
 * };
 *
 * // 3. Runtime logic (in your game engine)
 * // When the seduction node is executed:
 * function executeSeductionNode(node, gameState) {
 *   const config = node.metadata.seductionConfig;
 *   const currentStage = config.currentStage || 0;
 *   const stage = config.stages[currentStage];
 *   const affinity = gameState.flags[config.affinityCheckFlag] || 0;
 *
 *   // Check if player meets affinity requirement
 *   if (affinity >= stage.requiredAffinity) {
 *     // Success - move to next stage
 *     if (currentStage + 1 >= config.stages.length) {
 *       // All stages complete - route to success
 *       return config.successTargetNodeId;
 *     } else {
 *       // Move to next stage
 *       config.currentStage = currentStage + 1;
 *       // Continue to next stage (might loop back to this node)
 *       return node.id;
 *     }
 *   } else {
 *     // Failure - route to failure path
 *     return config.failureTargetNodeId;
 *   }
 * }
 * ```
 *
 * TIPS FOR SCENE DESIGNERS:
 *
 * - Set progressive affinity requirements (e.g., 20, 50, 80)
 * - Create success/failure paths for interesting branching
 * - Use different stages for different types of NPCs
 * - Consider adding video nodes at each stage for visual feedback
 * - Test with different affinity values to ensure balance
 *
 * EXTENDING THIS PLUGIN:
 *
 * You can create similar plugins for other multi-stage interactions:
 * - Interrogation (multiple questions with trust checks)
 * - Persuasion (progressive arguments with logic checks)
 * - Combat (rounds with health/skill checks)
 * - Negotiation (offers with charisma checks)
 *
 * The pattern is the same:
 * 1. Define your data structure
 * 2. Register with registerPluginDefinition
 * 3. Create an editor component
 * 4. Implement runtime logic in your game engine
 */
