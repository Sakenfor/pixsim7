/**
 * Intimacy Scene Node Type Registration
 *
 * Registers intimacy-related node types for the scene graph editor.
 * These nodes integrate with the relationship/intimacy system and generation pipeline.
 *
 * @see docs/INTIMACY_AND_GENERATION.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md
 */

import { nodeTypeRegistry } from '@features/graph';

/**
 * Register all intimacy-related node types
 */
export function registerIntimacyNodeTypes() {
  // Intimacy Scene node
  nodeTypeRegistry.register({
    id: 'intimacy_scene',
    name: 'Intimacy Scene',
    description: 'Relationship-gated intimate scene with content rating controls',
    icon: '💕',
    category: 'custom',
    scope: 'scene',
    userCreatable: true,
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
    defaultData: {
      sceneType: 'flirt',
      intensity: 'light',
      targetIds: [],
      gates: [],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: [],
    },
    editorComponent: 'IntimacySceneNodeEditor',
    rendererComponent: 'IntimacySceneNodeRenderer',
    preloadPriority: 5,
  });

  // Relationship Gate node (standalone gate check)
  nodeTypeRegistry.register({
    id: 'relationship_gate',
    name: 'Relationship Gate',
    description: 'Check if relationship requirements are met',
    icon: '🚪',
    category: 'logic',
    scope: 'scene',
    userCreatable: true,
    color: 'text-rose-700 dark:text-rose-300',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    defaultData: {
      gate: {
        id: 'gate_1',
        name: 'New Gate',
        requiredTier: 'friend',
      },
      passedTargetNodeId: '',
      failedTargetNodeId: '',
    },
    editorComponent: 'RelationshipGateNodeEditor',
    rendererComponent: 'RelationshipGateNodeRenderer',
    preloadPriority: 6,
    ports: {
      inputs: [
        {
          id: 'input',
          label: 'In',
          position: 'top',
          color: '#3b82f6',
        },
      ],
      outputs: [
        {
          id: 'passed',
          label: 'Gate Passed',
          position: 'bottom',
          color: '#10b981',
          description: 'Relationship requirements met',
        },
        {
          id: 'failed',
          label: 'Gate Failed',
          position: 'bottom',
          color: '#ef4444',
          description: 'Relationship requirements not met',
        },
      ],
    },
  });

  // Progression Stage node (marks a stage in a progression arc)
  nodeTypeRegistry.register({
    id: 'progression_stage',
    name: 'Progression Stage',
    description: 'Milestone in a relationship progression arc',
    icon: '⭐',
    category: 'custom',
    scope: 'scene',
    userCreatable: true,
    color: 'text-violet-700 dark:text-violet-300',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    defaultData: {
      stageName: 'New Stage',
      tier: 'friend',
      gate: {
        id: 'stage_gate',
        name: 'Stage Gate',
        requiredTier: 'friend',
      },
      onEnterEffects: {
        affinityDelta: 5,
        setFlags: [],
      },
    },
    editorComponent: 'ProgressionStageNodeEditor',
    rendererComponent: 'ProgressionStageNodeRenderer',
    preloadPriority: 5,
  });

  // Intimacy Generation node (extends base generation with intimacy context)
  nodeTypeRegistry.register({
    id: 'intimacy_generation',
    name: 'Intimacy Generation',
    description: 'Dynamic content generation with relationship/intimacy context',
    icon: '✨',
    category: 'custom',
    scope: 'scene',
    userCreatable: true,
    color: 'text-fuchsia-700 dark:text-fuchsia-300',
    bgColor: 'bg-fuchsia-100 dark:bg-fuchsia-900/30',
    defaultData: {
      generationType: 'transition',
      purpose: 'adaptive',
      strategy: 'per_playthrough',
      socialContext: {
        intimacyBand: 'light',
        contentRating: 'romantic',
      },
      enabled: true,
      version: 1,
    },
    editorComponent: 'IntimacyGenerationNodeEditor',
    rendererComponent: 'IntimacyGenerationNodeRenderer',
    preloadPriority: 5,
  });
}

/**
 * Get all registered intimacy node type IDs
 */
export function getIntimacyNodeTypeIds(): string[] {
  return [
    'intimacy_scene',
    'relationship_gate',
    'progression_stage',
    'intimacy_generation',
  ];
}

/**
 * Check if a node type is an intimacy node
 */
export function isIntimacyNodeType(nodeType: string): boolean {
  return getIntimacyNodeTypeIds().includes(nodeType);
}
