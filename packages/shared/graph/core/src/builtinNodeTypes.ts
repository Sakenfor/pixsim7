import type { NodeSettingsSchema } from '@pixsim7/shared.types';
import { nodeTypeRegistry } from './nodeTypeRegistry';
import { registerNpcResponseNode } from './npcResponseNode';
import { registerIntimacyNodeTypes } from './intimacyNodeTypes';

// Ensure built-in node types are only registered once per process
let builtinNodeTypesRegistered = false;

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
  nodeTypeRegistry.register({
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
    settingsSchema: {
      defaults: {
        autoPlay: true,
        loopByDefault: false,
        defaultVolume: 80,
      },
      groups: [
        {
          id: 'playback',
          title: 'Playback',
          description: 'Default playback behavior for video nodes',
          fields: [
            { key: 'autoPlay', label: 'Auto-play', description: 'Automatically start playback when the node is entered', type: 'toggle' },
            { key: 'loopByDefault', label: 'Loop by default', description: 'Loop media when it reaches the end', type: 'toggle' },
            { key: 'defaultVolume', label: 'Default volume', description: 'Initial volume level for new video nodes', type: 'range', min: 0, max: 100, step: 5, format: (v: number) => `${v}%` },
          ],
        },
      ],
    },
  });

  // Choice node
  nodeTypeRegistry.register({
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
    settingsSchema: {
      defaults: {
        showTimer: false,
        timerDuration: 15,
        shuffleChoices: false,
      },
      groups: [
        {
          id: 'display',
          title: 'Display',
          description: 'Default display and timing options for choice nodes',
          fields: [
            { key: 'showTimer', label: 'Show timer', description: 'Display a countdown timer for timed choices', type: 'toggle' },
            { key: 'timerDuration', label: 'Timer duration', description: 'Default countdown duration in seconds', type: 'range', min: 5, max: 60, step: 1, format: (v: number) => `${v}s` },
            { key: 'shuffleChoices', label: 'Shuffle choices', description: 'Randomize the order of choices each time', type: 'toggle' },
          ],
        },
      ],
    },
    ports: {
      dynamic: (node) => {
        // Read choices from node metadata
        const metadata = node.metadata;
        const choices = metadata?.choices || [];

        // Default choices if none configured
        const choicesData = choices.length > 0
          ? choices.map((choice: any, index: number) => ({
              id: choice.id,
              label: choice.text || `Choice ${index + 1}`,
              color: choice.color || '#a855f7',
              description: `Player chooses: ${choice.text}`,
            }))
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
          outputs: choicesData.map((choice: any) => ({
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
  nodeTypeRegistry.register({
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
  });

  // End node
  nodeTypeRegistry.register({
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
  });

  // Scene call node
  nodeTypeRegistry.register({
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
    ports: {
      dynamic: (node) => {
        // Read return points from node metadata
        const metadata = node.metadata;
        const returnPoints = metadata?.returnPoints || [];

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

        const returnData = returnPoints.map((rp: any, index: number) => ({
          id: rp.id,
          label: rp.label || `Return ${index + 1}`,
          position: 'bottom',
          color: rp.color || '#a855f7',
          description: rp.description,
        }));

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
  nodeTypeRegistry.register({
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
  });

  // Generation node (experimental)
  nodeTypeRegistry.register({
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
        generationType: 'video_transition',
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
    settingsSchema: {
      defaults: {
        defaultStrategy: 'once',
        timeoutMs: 30000,
        showPlaceholder: true,
      },
      groups: [
        {
          id: 'behavior',
          title: 'Behavior',
          description: 'Default generation behavior and fallback options',
          fields: [
            {
              key: 'defaultStrategy',
              label: 'Default strategy',
              description: 'When to trigger content generation',
              type: 'select',
              options: [
                { value: 'once', label: 'Once' },
                { value: 'every-visit', label: 'Every visit' },
                { value: 'on-demand', label: 'On demand' },
              ],
            },
            { key: 'timeoutMs', label: 'Timeout', description: 'Maximum time to wait for generation to complete', type: 'range', min: 5000, max: 120000, step: 5000, format: (v: number) => `${(v / 1000).toFixed(0)}s` },
            { key: 'showPlaceholder', label: 'Show placeholder', description: 'Display a placeholder while content is generating', type: 'toggle' },
          ],
        },
      ],
    },
  });

  // Action node
  nodeTypeRegistry.register({
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
  });

  // Mini-Game node (special video node with mini-game metadata)
  nodeTypeRegistry.register({
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
    settingsSchema: {
      defaults: {
        allowSkip: false,
        showHints: true,
      },
      groups: [
        {
          id: 'defaults',
          title: 'Defaults',
          description: 'Default behavior for mini-game nodes',
          fields: [
            { key: 'allowSkip', label: 'Allow skip', description: 'Let players skip the mini-game segment', type: 'toggle' },
            { key: 'showHints', label: 'Show hints', description: 'Display gameplay hints during the mini-game', type: 'toggle' },
          ],
        },
      ],
    },
  });

  // Node Group (organizational)
  nodeTypeRegistry.register({
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
  });
}
