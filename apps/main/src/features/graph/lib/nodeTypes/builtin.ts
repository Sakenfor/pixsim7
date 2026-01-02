import type { DraftSceneNode } from '@domain/sceneBuilder';

import { sceneNodeTypeRegistry } from './sceneRegistry';
import type { SceneRuntimeNode } from './sceneRegistry';
import { registerNpcResponseNode } from './npcResponse';
import { registerIntimacyNodeTypes } from '@features/interactions';

// Ensure built-in node types are only registered once per process
let builtinNodeTypesRegistered = false;

function createBaseRuntimeNode(node: DraftSceneNode): SceneRuntimeNode {
  return {
    nodeType: 'scene_content',
    id: node.id,
    type: node.type,
    label: node.metadata?.label,
    meta: node.metadata,
  };
}

function getNodeMetadata(node: DraftSceneNode): Record<string, unknown> | undefined {
  return node.metadata as Record<string, unknown> | undefined;
}

/** Register all built-in node types (idempotent) */
export function registerBuiltinNodeTypes() {
  if (builtinNodeTypesRegistered) {
    return;
  }
  builtinNodeTypesRegistered = true;

  // Register NPC Response node
  registerNpcResponseNode();

  // Register Intimacy nodes
  registerIntimacyNodeTypes();

  // Video node
  sceneNodeTypeRegistry.register({
    id: 'video',
    name: 'Video',
    description: 'Play video/audio media',
    icon: '🎬',
    category: 'media',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    defaultData: {
      mediaUrl: '',
      media: [],
      selection: { kind: 'ordered' },
      playback: { kind: 'normal' },
    },
    editorComponent: 'VideoNodeEditor',
    rendererComponent: 'VideoNodeRenderer',
    preloadPriority: 10, // Very common, preload eagerly
    toRuntime: (node) => ({
      ...createBaseRuntimeNode(node),
      media: node.segments,
      selection: node.selection,
      playback: node.playback,
    }),
  });

  // Choice node
  sceneNodeTypeRegistry.register({
    id: 'choice',
    name: 'Choice',
    description: 'Player makes a choice',
    icon: '🔀',
    category: 'flow',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    defaultData: {
      choices: [],
    },
    editorComponent: 'ChoiceNodeEditor',
    rendererComponent: 'ChoiceNodeRenderer',
    preloadPriority: 9, // Very common, preload eagerly
    toRuntime: (node) => {
      const metadata = getNodeMetadata(node);
      const choices = Array.isArray(metadata?.choices) ? metadata.choices : [];
      return {
        ...createBaseRuntimeNode(node),
        choices: choices as SceneRuntimeNode['choices'],
      };
    },
    ports: {
      dynamic: (node) => {
        // Read choices from node metadata
        const metadata = (node as { metadata?: Record<string, unknown> }).metadata;
        const choices = Array.isArray(metadata?.choices) ? metadata.choices : [];

        // Default choices if none configured
        const choicesData = choices.length > 0
          ? choices.map((choice, index) => {
              const record = choice as Record<string, unknown>;
              const id = typeof record.id === 'string' ? record.id : `choice_${index + 1}`;
              const text = typeof record.text === 'string' ? record.text : undefined;
              const color = typeof record.color === 'string' ? record.color : '#a855f7';
              return {
                id,
                label: text || `Choice ${index + 1}`,
                color,
                description: text ? `Player chooses: ${text}` : undefined,
              };
            })
          : [
              { id: 'choice_1', label: 'Choice 1', color: '#a855f7' },
              { id: 'choice_2', label: 'Choice 2', color: '#a855f7' },
            ];

        return {
          inputs: [
            {
              id: 'input',
              label: 'In',
              position: 'top',
              color: '#3b82f6',
            },
          ],
          outputs: choicesData.map((choice) => ({
            id: choice.id,
            label: choice.label,
            position: 'bottom',
            color: choice.color,
            description: choice.description,
          })),
        };
      },
    },
  });

  // Condition node
  sceneNodeTypeRegistry.register({
    id: 'condition',
    name: 'Condition',
    description: 'Branch based on flags',
    icon: '❓',
    category: 'logic',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    defaultData: {
      condition: { key: '', op: 'eq', value: '' },
      trueTargetNodeId: '',
      falseTargetNodeId: '',
    },
    editorComponent: 'ConditionNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 7, // Common, but uses default renderer
    toRuntime: (node) => {
      const metadata = getNodeMetadata(node);
      return {
        ...createBaseRuntimeNode(node),
        condition: metadata?.condition as SceneRuntimeNode['condition'],
        trueTargetNodeId:
          typeof metadata?.trueTargetNodeId === 'string'
            ? metadata.trueTargetNodeId
            : undefined,
        falseTargetNodeId:
          typeof metadata?.falseTargetNodeId === 'string'
            ? metadata.falseTargetNodeId
            : undefined,
      };
    },
  });

  // End node
  sceneNodeTypeRegistry.register({
    id: 'end',
    name: 'End',
    description: 'End scene',
    icon: '🏁',
    category: 'flow',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    defaultData: {
      endType: 'success',
      endMessage: '',
    },
    editorComponent: 'EndNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 5, // Common but simple
    toRuntime: (node) => {
      const metadata = getNodeMetadata(node);
      const endConfig = metadata?.endConfig as
        | { endType?: SceneRuntimeNode['endType']; message?: string }
        | undefined;
      return {
        ...createBaseRuntimeNode(node),
        endType: endConfig?.endType || 'neutral',
        endMessage: endConfig?.message,
      };
    },
  });

  // Scene call node
  sceneNodeTypeRegistry.register({
    id: 'scene_call',
    name: 'Scene Call',
    description: 'Call another scene',
    icon: '📞',
    category: 'flow',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    defaultData: {
      targetSceneId: '',
      parameterBindings: {},
      returnRouting: {},
    },
    editorComponent: 'SceneCallNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 8, // Common in complex scenes
    toRuntime: (node) => {
      const callNode = node as Extract<DraftSceneNode, { type: 'scene_call' }>;
      return {
        ...createBaseRuntimeNode(node),
        targetSceneId: callNode.targetSceneId,
        parameterBindings: callNode.parameterBindings,
        returnRouting: callNode.returnRouting,
      };
    },
    ports: {
      dynamic: (node) => {
        // Read return points from node metadata
        const metadata = (node as { metadata?: Record<string, unknown> }).metadata;
        const returnPoints = Array.isArray(metadata?.returnPoints) ? metadata.returnPoints : [];

        // Default return point if none configured
        if (returnPoints.length === 0) {
          return {
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
                id: 'default',
                label: 'Return',
                position: 'bottom',
                color: '#a855f7',
              },
            ],
          };
        }

        const returnData = returnPoints.map((rp, index) => {
          const record = rp as Record<string, unknown>;
          return {
            id: typeof record.id === 'string' ? record.id : `return_${index + 1}`,
            label: typeof record.label === 'string' ? record.label : `Return ${index + 1}`,
            position: 'bottom' as const,
            color: typeof record.color === 'string' ? record.color : '#a855f7',
            description: typeof record.description === 'string' ? record.description : undefined,
          };
        });

        return {
          inputs: [
            {
              id: 'input',
              label: 'In',
              position: 'top',
              color: '#3b82f6',
            },
          ],
          outputs: returnData,
        };
      },
    },
  });

  // Return node
  sceneNodeTypeRegistry.register({
    id: 'return',
    name: 'Return',
    description: 'Return from scene call',
    icon: '🔙',
    category: 'flow',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    defaultData: {
      returnPointId: '',
      returnValues: {},
    },
    editorComponent: 'ReturnNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 5, // Moderate frequency
    toRuntime: (node) => {
      const returnNode = node as Extract<DraftSceneNode, { type: 'return' }>;
      return {
        ...createBaseRuntimeNode(node),
        returnPointId: returnNode.returnPointId,
        returnValues: returnNode.returnValues,
      };
    },
  });

  // Generation node (experimental)
  sceneNodeTypeRegistry.register({
    id: 'generation',
    name: 'Generation',
    description: 'AI content generation',
    icon: '🤖',
    category: 'custom',
    scope: 'scene', // Scene-level node
    userCreatable: false, // Hidden from UI for now
    color: 'text-violet-700 dark:text-violet-300',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    defaultData: {
      config: {
        generationType: 'transition',
        purpose: 'gap_fill',
        style: {
          pacing: 'medium',
          transitionType: 'gradual',
        },
        duration: {},
        constraints: {},
        strategy: 'once',
        fallback: {
          mode: 'placeholder',
          timeoutMs: 30000,
        },
        enabled: true,
        version: 1,
      },
    },
    editorComponent: 'GenerationNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 2, // Experimental, rare
    toRuntime: (node) => ({
      ...createBaseRuntimeNode(node),
    }),
  });

  // Action node
  sceneNodeTypeRegistry.register({
    id: 'action',
    name: 'Action',
    description: 'Trigger actions/effects',
    icon: '⚡',
    category: 'action',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    defaultData: {
      effects: [],
    },
    editorComponent: 'ActionNodeEditor', // TODO: create this
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 6, // Moderately common
    toRuntime: (node) => ({
      ...createBaseRuntimeNode(node),
    }),
  });

  // Mini-Game node (special video node with mini-game metadata)
  sceneNodeTypeRegistry.register({
    id: 'miniGame',
    name: 'Mini-Game',
    description: 'Interactive gameplay segment',
    icon: '🎮',
    category: 'media',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    defaultData: {
      mediaUrl: '',
      media: [],
      selection: { kind: 'ordered' },
      playback: { kind: 'normal' },
      metadata: {
        isMiniGame: true,
      },
    },
    editorComponent: 'MiniGameNodeEditor',
    rendererComponent: 'VideoNodeRenderer',
    preloadPriority: 3, // Less common
    toRuntime: (node) => ({
      ...createBaseRuntimeNode(node),
    }),
  });

  // Node Group (organizational)
  sceneNodeTypeRegistry.register({
    id: 'node_group',
    name: 'Group',
    description: 'Visual container for organizing nodes',
    icon: '📦',
    category: 'custom',
    scope: 'scene', // Scene-level node
    userCreatable: true,
    color: 'text-neutral-700 dark:text-neutral-300',
    bgColor: 'bg-neutral-100 dark:bg-neutral-900/30',
    defaultData: {
      collapsed: false,
    },
    rendererComponent: 'DefaultNodeRenderer',
    preloadPriority: 1, // Organizational, less critical
    toRuntime: () => null,
  });
}
