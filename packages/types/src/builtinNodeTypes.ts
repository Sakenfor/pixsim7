import { nodeTypeRegistry } from './nodeTypeRegistry';

/** Register all built-in node types */
export function registerBuiltinNodeTypes() {
  // Video node
  nodeTypeRegistry.register({
    id: 'video',
    name: 'Video',
    description: 'Play video/audio media',
    icon: '🎬',
    category: 'media',
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
  });

  // Choice node
  nodeTypeRegistry.register({
    id: 'choice',
    name: 'Choice',
    description: 'Player makes a choice',
    icon: '🔀',
    category: 'flow',
    userCreatable: true,
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    defaultData: {
      choices: [],
    },
    editorComponent: 'ChoiceNodeEditor',
  });

  // Condition node
  nodeTypeRegistry.register({
    id: 'condition',
    name: 'Condition',
    description: 'Branch based on flags',
    icon: '❓',
    category: 'logic',
    userCreatable: true,
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    defaultData: {
      condition: { key: '', op: 'eq', value: '' },
      trueTargetNodeId: '',
      falseTargetNodeId: '',
    },
    editorComponent: 'ConditionNodeEditor',
  });

  // End node
  nodeTypeRegistry.register({
    id: 'end',
    name: 'End',
    description: 'End scene',
    icon: '🏁',
    category: 'flow',
    userCreatable: true,
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    defaultData: {
      endType: 'success',
      endMessage: '',
    },
    editorComponent: 'EndNodeEditor',
  });

  // Scene call node
  nodeTypeRegistry.register({
    id: 'scene_call',
    name: 'Scene Call',
    description: 'Call another scene',
    icon: '📞',
    category: 'flow',
    userCreatable: true,
    color: 'text-cyan-700 dark:text-cyan-300',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    defaultData: {
      targetSceneId: '',
      parameterBindings: {},
      returnRouting: {},
    },
    editorComponent: 'SceneCallNodeEditor',
  });

  // Return node
  nodeTypeRegistry.register({
    id: 'return',
    name: 'Return',
    description: 'Return from scene call',
    icon: '🔙',
    category: 'flow',
    userCreatable: true,
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    defaultData: {
      returnPointId: '',
      returnValues: {},
    },
    editorComponent: 'ReturnNodeEditor',
  });

  // Generation node (experimental)
  nodeTypeRegistry.register({
    id: 'generation',
    name: 'Generation',
    description: 'AI content generation',
    icon: '🤖',
    category: 'custom',
    userCreatable: false, // Hidden from UI for now
    color: 'text-violet-700 dark:text-violet-300',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    defaultData: {},
  });

  // Action node
  nodeTypeRegistry.register({
    id: 'action',
    name: 'Action',
    description: 'Trigger actions/effects',
    icon: '⚡',
    category: 'action',
    userCreatable: true,
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    defaultData: {
      effects: [],
    },
    editorComponent: 'ActionNodeEditor', // TODO: create this
  });

  // Mini-Game node (special video node with mini-game metadata)
  nodeTypeRegistry.register({
    id: 'miniGame',
    name: 'Mini-Game',
    description: 'Interactive gameplay segment',
    icon: '🎮',
    category: 'media',
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
  });

  // Node Group (organizational)
  nodeTypeRegistry.register({
    id: 'node_group',
    name: 'Group',
    description: 'Visual container for organizing nodes',
    icon: '📦',
    category: 'custom',
    userCreatable: true,
    color: 'text-neutral-700 dark:text-neutral-300',
    bgColor: 'bg-neutral-100 dark:bg-neutral-900/30',
    defaultData: {
      collapsed: false,
    },
  });
}
