/**
 * NPC Response Node Type
 * Uses embedded micro-graphs to define NPC responses to tool interactions
 * Integrates with existing scene graph system and AI video generation
 */

import { nodeTypeRegistry, type NodeTypeDefinition } from './nodeTypeRegistry';
import type { NpcZoneConfiguration } from '@pixsim7/shared.types';

// ============================================================================
// NPC Response Data Structure
// ============================================================================

/**
 * Micro-graph node for NPC response logic
 * These are NOT scene nodes - they're internal to the NPC Response node
 */
export interface ResponseGraphNode {
  id: string;
  type: ResponseNodeType;
  label?: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface ResponseGraphConnection {
  id: string;
  from: string; // node id
  fromPort: string; // port id
  to: string;
  toPort: string;
}

/**
 * Types of nodes in the response micro-graph
 */
export type ResponseNodeType =
  // Input nodes
  | 'input.tool'      // Current tool being used
  | 'input.pressure'   // Pressure value (0-1)
  | 'input.speed'      // Speed value (0-1)
  | 'input.pattern'    // Touch pattern detected
  | 'input.zone'       // Body zone touched
  | 'input.duration'   // Duration of current interaction (ms)
  | 'input.history'    // Access to recent interactions

  // Math & Logic
  | 'math.add'
  | 'math.multiply'
  | 'math.clamp'
  | 'math.smooth'      // Smooth/lerp between values
  | 'math.remap'       // Remap value from one range to another
  | 'logic.compare'    // Compare values (>, <, ==, etc)
  | 'logic.and'
  | 'logic.or'
  | 'logic.not'
  | 'logic.gate'       // Enable/disable flow
  | 'logic.switch'     // Route based on value

  // State Management
  | 'state.accumulator' // Track cumulative value (pleasure meter, etc)
  | 'state.machine'     // State machine with transitions
  | 'state.memory'      // Remember values between evaluations
  | 'state.timer'       // Track time/duration
  | 'state.threshold'   // Trigger when value crosses threshold
  | 'state.combo'       // Detect sequence of actions

  // Response Generation
  | 'response.expression' // Generate facial expression
  | 'response.animation'  // Generate body animation/pose
  | 'response.sound'      // Generate vocalization/sound
  | 'response.emotion'    // Generate emotion state
  | 'response.intensity'  // Generate intensity value (0-1)

  // Video Generation
  | 'video.prompt'        // Build AI prompt from inputs
  | 'video.style'         // Set video style parameters
  | 'video.lora'          // Select LoRA models
  | 'video.output'        // Final output node

  // Utility
  | 'util.merge'       // Merge multiple inputs
  | 'util.delay'       // Add delay
  | 'util.random'      // Random value/selection
  | 'util.debug';      // Output debug info

/**
 * NPC Response Node metadata structure
 */
export interface NpcResponseMetadata {
  // The response graph (micro-graph inside this node)
  responseGraph: {
    nodes: ResponseGraphNode[];
    connections: ResponseGraphConnection[];
  };

  // NPC character settings
  npc: {
    id?: string;
    name: string;
    avatarUrl?: string;
    personality?: 'gentle' | 'intense' | 'playful' | 'custom';
  };

  // Video generation settings
  videoGen: {
    enabled: boolean;
    provider?: 'comfyui' | 'stable-diffusion' | 'custom';
    basePrompt?: string; // Base prompt for this NPC
    style?: {
      artStyle: 'anime' | 'realistic' | 'semi-realistic';
      quality: 'draft' | 'standard' | 'high';
      loras?: string[];
    };
    technical?: {
      fps?: number;
      resolution?: string;
      steps?: number;
      cfg?: number;
    };

    // Real-time generation settings
    realtime?: {
      /** Quality/speed preset for gameplay */
      preset: 'realtime' | 'fast' | 'balanced' | 'quality';
      /** Max wait time before showing fallback (ms) */
      maxWaitTime: number;
      /** Fallback strategy */
      fallback: 'placeholder' | 'procedural' | 'cached' | 'freeze';
      /** Enable predictive pre-generation */
      predictive: boolean;
      /** Cache size */
      cacheSize: number;
      /** Progressive loading (low -> high quality) */
      progressive: boolean;
      /** Pre-generate common states on scene load */
      preGenerate: boolean;
    };
  };

  // Interaction settings
  interaction: {
    enabledTools?: string[]; // Tool IDs that can be used
    zones?: string[]; // Body zones that can be interacted with
    responseCooldown?: number; // ms between responses
    maxSessionDuration?: number; // ms
  };

  // Interactive zones configuration (NEW)
  zones?: NpcZoneConfiguration;

  // Preview/debug settings
  debug?: {
    showGraph?: boolean;
    logEvaluations?: boolean;
    simulatedInput?: {
      tool: string;
      pressure: number;
      speed: number;
    };
  };
}

// ============================================================================
// Response Graph Template System
// ============================================================================

/**
 * Pre-built response graph templates
 */
export interface ResponseGraphTemplate {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'advanced' | 'game' | 'custom';
  thumbnail?: string;
  graph: {
    nodes: ResponseGraphNode[];
    connections: ResponseGraphConnection[];
  };
}

/**
 * Built-in response templates
 */
export const RESPONSE_TEMPLATES: ResponseGraphTemplate[] = [
  {
    id: 'simple_pleasure',
    name: 'Simple Pleasure Meter',
    description: 'Basic pleasure accumulator that increases with positive interactions',
    category: 'basic',
    graph: {
      nodes: [
        {
          id: 'tool_input',
          type: 'input.tool',
          position: { x: 100, y: 100 },
          data: {},
        },
        {
          id: 'pressure_input',
          type: 'input.pressure',
          position: { x: 100, y: 200 },
          data: {},
        },
        {
          id: 'accumulator',
          type: 'state.accumulator',
          position: { x: 300, y: 150 },
          data: {
            initialValue: 0,
            decayRate: 0.1, // decay per second
            min: 0,
            max: 1,
          },
        },
        {
          id: 'expression',
          type: 'response.expression',
          position: { x: 500, y: 100 },
          data: {
            thresholds: {
              0: 'neutral',
              0.3: 'interested',
              0.6: 'pleased',
              0.8: 'ecstatic',
            },
          },
        },
        {
          id: 'prompt_builder',
          type: 'video.prompt',
          position: { x: 700, y: 150 },
          data: {
            template: 'anime girl {expression}, {emotion}, detailed face, soft lighting',
          },
        },
        {
          id: 'output',
          type: 'video.output',
          position: { x: 900, y: 150 },
          data: {},
        },
      ],
      connections: [
        { id: 'c1', from: 'pressure_input', fromPort: 'value', to: 'accumulator', toPort: 'input' },
        { id: 'c2', from: 'accumulator', fromPort: 'value', to: 'expression', toPort: 'intensity' },
        { id: 'c3', from: 'expression', fromPort: 'expression', to: 'prompt_builder', toPort: 'expression' },
        { id: 'c4', from: 'prompt_builder', fromPort: 'prompt', to: 'output', toPort: 'prompt' },
      ],
    },
  },
  {
    id: 'tickle_torture',
    name: 'Tickle Torture Mini-Game',
    description: 'Tracks ticklishness per zone with resistance mechanics',
    category: 'game',
    graph: {
      nodes: [
        {
          id: 'zone_input',
          type: 'input.zone',
          position: { x: 100, y: 100 },
          data: {},
        },
        {
          id: 'tool_input',
          type: 'input.tool',
          position: { x: 100, y: 200 },
          data: {},
        },
        {
          id: 'pressure_input',
          type: 'input.pressure',
          position: { x: 100, y: 300 },
          data: {},
        },
        {
          id: 'zone_sensitivity',
          type: 'state.memory',
          position: { x: 300, y: 100 },
          data: {
            key: 'zoneSensitivity',
            initial: {
              ribs: 0.9,
              feet: 0.8,
              armpits: 0.95,
              sides: 0.7,
            },
          },
        },
        {
          id: 'multiply_sensitivity',
          type: 'math.multiply',
          position: { x: 500, y: 200 },
          data: {},
        },
        {
          id: 'tickle_meter',
          type: 'state.accumulator',
          position: { x: 700, y: 200 },
          data: {
            initialValue: 0,
            decayRate: 0.2,
            min: 0,
            max: 1,
          },
        },
        {
          id: 'threshold_check',
          type: 'state.threshold',
          position: { x: 900, y: 200 },
          data: {
            threshold: 0.8,
            behavior: 'trigger', // or 'continuous'
          },
        },
        {
          id: 'state_machine',
          type: 'state.machine',
          position: { x: 500, y: 400 },
          data: {
            states: [
              { id: 'resisting', expression: 'determined', animation: 'tense' },
              { id: 'giggling', expression: 'laughing', animation: 'squirm' },
              { id: 'begging', expression: 'pleading', animation: 'struggling' },
              { id: 'broken', expression: 'helpless_laugh', animation: 'weak' },
            ],
            transitions: [
              { from: 'resisting', to: 'giggling', threshold: 0.3 },
              { from: 'giggling', to: 'begging', threshold: 0.6 },
              { from: 'begging', to: 'broken', threshold: 0.9 },
            ],
          },
        },
        {
          id: 'prompt',
          type: 'video.prompt',
          position: { x: 700, y: 400 },
          data: {
            template: 'anime girl being tickled, {expression}, {animation}, {emotion}, detailed, high quality',
          },
        },
        {
          id: 'output',
          type: 'video.output',
          position: { x: 900, y: 400 },
          data: {},
        },
      ],
      connections: [
        { id: 'c1', from: 'zone_input', fromPort: 'zone', to: 'zone_sensitivity', toPort: 'key' },
        { id: 'c2', from: 'zone_sensitivity', fromPort: 'value', to: 'multiply_sensitivity', toPort: 'a' },
        { id: 'c3', from: 'pressure_input', fromPort: 'value', to: 'multiply_sensitivity', toPort: 'b' },
        { id: 'c4', from: 'multiply_sensitivity', fromPort: 'result', to: 'tickle_meter', toPort: 'input' },
        { id: 'c5', from: 'tickle_meter', fromPort: 'value', to: 'threshold_check', toPort: 'value' },
        { id: 'c6', from: 'tickle_meter', fromPort: 'value', to: 'state_machine', toPort: 'intensity' },
        { id: 'c7', from: 'state_machine', fromPort: 'expression', to: 'prompt', toPort: 'expression' },
        { id: 'c8', from: 'state_machine', fromPort: 'animation', to: 'prompt', toPort: 'animation' },
        { id: 'c9', from: 'prompt', fromPort: 'prompt', to: 'output', toPort: 'prompt' },
      ],
    },
  },
  {
    id: 'arousal_progression',
    name: 'Arousal Progression System',
    description: 'Multi-stage arousal with tool preferences and pattern bonuses',
    category: 'advanced',
    graph: {
      nodes: [
        {
          id: 'tool_input',
          type: 'input.tool',
          position: { x: 100, y: 100 },
          data: {},
        },
        {
          id: 'pattern_input',
          type: 'input.pattern',
          position: { x: 100, y: 200 },
          data: {},
        },
        {
          id: 'duration_input',
          type: 'input.duration',
          position: { x: 100, y: 300 },
          data: {},
        },
        {
          id: 'tool_preference',
          type: 'state.memory',
          position: { x: 300, y: 100 },
          data: {
            key: 'toolPreference',
            initial: {
              touch: 0.7,
              feather: 0.9,
              temperature: 0.5,
              energy: 0.4,
            },
          },
        },
        {
          id: 'pattern_bonus',
          type: 'state.memory',
          position: { x: 300, y: 200 },
          data: {
            key: 'patternBonus',
            initial: {
              circular: 1.2,
              zigzag: 0.8,
              tap: 0.6,
            },
          },
        },
        {
          id: 'combo_detector',
          type: 'state.combo',
          position: { x: 300, y: 400 },
          data: {
            sequences: [
              { pattern: ['touch', 'feather', 'touch'], bonus: 1.5, label: 'gentle_combo' },
              { pattern: ['temperature', 'energy'], bonus: 1.3, label: 'intense_combo' },
            ],
            windowMs: 5000,
          },
        },
        {
          id: 'multiply_all',
          type: 'math.multiply',
          position: { x: 500, y: 200 },
          data: {},
        },
        {
          id: 'arousal_meter',
          type: 'state.accumulator',
          position: { x: 700, y: 200 },
          data: {
            initialValue: 0,
            decayRate: 0.05, // Slow decay
            min: 0,
            max: 1,
          },
        },
        {
          id: 'arousal_stages',
          type: 'state.machine',
          position: { x: 900, y: 200 },
          data: {
            states: [
              { id: 'neutral', expression: 'calm', emotion: 'neutral', animation: 'idle' },
              { id: 'interested', expression: 'curious', emotion: 'interest', animation: 'lean_in' },
              { id: 'aroused', expression: 'blushing', emotion: 'desire', animation: 'breathless' },
              { id: 'passionate', expression: 'flushed', emotion: 'passion', animation: 'trembling' },
              { id: 'climax', expression: 'ecstatic', emotion: 'bliss', animation: 'overwhelmed' },
            ],
            transitions: [
              { from: 'neutral', to: 'interested', threshold: 0.2 },
              { from: 'interested', to: 'aroused', threshold: 0.4 },
              { from: 'aroused', to: 'passionate', threshold: 0.7 },
              { from: 'passionate', to: 'climax', threshold: 0.9 },
            ],
          },
        },
        {
          id: 'prompt_builder',
          type: 'video.prompt',
          position: { x: 1100, y: 200 },
          data: {
            template: 'beautiful anime girl, {expression}, {emotion}, {animation}, intimate scene, soft lighting, detailed face',
          },
        },
        {
          id: 'lora_selector',
          type: 'video.lora',
          position: { x: 1100, y: 350 },
          data: {
            loras: {
              neutral: [],
              interested: ['subtle_expressions'],
              aroused: ['blushing_v2', 'intimate_poses'],
              passionate: ['intense_emotion', 'detailed_face'],
              climax: ['peak_expression', 'smooth_animation'],
            },
          },
        },
        {
          id: 'output',
          type: 'video.output',
          position: { x: 1300, y: 275 },
          data: {},
        },
      ],
      connections: [
        { id: 'c1', from: 'tool_input', fromPort: 'tool', to: 'tool_preference', toPort: 'key' },
        { id: 'c2', from: 'pattern_input', fromPort: 'pattern', to: 'pattern_bonus', toPort: 'key' },
        { id: 'c3', from: 'tool_input', fromPort: 'tool', to: 'combo_detector', toPort: 'action' },
        { id: 'c4', from: 'tool_preference', fromPort: 'value', to: 'multiply_all', toPort: 'a' },
        { id: 'c5', from: 'pattern_bonus', fromPort: 'value', to: 'multiply_all', toPort: 'b' },
        { id: 'c6', from: 'combo_detector', fromPort: 'bonus', to: 'multiply_all', toPort: 'c' },
        { id: 'c7', from: 'multiply_all', fromPort: 'result', to: 'arousal_meter', toPort: 'input' },
        { id: 'c8', from: 'arousal_meter', fromPort: 'value', to: 'arousal_stages', toPort: 'intensity' },
        { id: 'c9', from: 'arousal_stages', fromPort: 'expression', to: 'prompt_builder', toPort: 'expression' },
        { id: 'c10', from: 'arousal_stages', fromPort: 'emotion', to: 'prompt_builder', toPort: 'emotion' },
        { id: 'c11', from: 'arousal_stages', fromPort: 'animation', to: 'prompt_builder', toPort: 'animation' },
        { id: 'c12', from: 'arousal_stages', fromPort: 'state', to: 'lora_selector', toPort: 'state' },
        { id: 'c13', from: 'prompt_builder', fromPort: 'prompt', to: 'output', toPort: 'prompt' },
        { id: 'c14', from: 'lora_selector', fromPort: 'loras', to: 'output', toPort: 'loras' },
      ],
    },
  },
];

// ============================================================================
// Register NPC Response Node Type
// ============================================================================

export function registerNpcResponseNode() {
  const npcResponseNode: NodeTypeDefinition<NpcResponseMetadata> = {
    id: 'npc_response',
    name: 'NPC Response',
    description: 'Interactive NPC with tool-based responses and AI video generation',
    icon: '🎭',
    category: 'custom',
    scope: 'scene',
    userCreatable: true,
    color: 'text-pink-700 dark:text-pink-300',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',

    defaultData: {
      responseGraph: {
        nodes: RESPONSE_TEMPLATES[0].graph.nodes,
        connections: RESPONSE_TEMPLATES[0].graph.connections,
      },
      npc: {
        name: 'New NPC',
        personality: 'gentle',
      },
      videoGen: {
        enabled: true,
        basePrompt: 'anime girl, detailed face, soft lighting',
        style: {
          artStyle: 'anime',
          quality: 'standard',
        },
        realtime: {
          preset: 'fast',
          maxWaitTime: 5000,
          fallback: 'placeholder',
          predictive: true,
          cacheSize: 50,
          progressive: true,
          preGenerate: true,
        },
      },
      interaction: {
        responseCooldown: 500,
      },
    },

    editorComponent: 'NpcResponseNodeEditor',
    rendererComponent: 'DefaultNodeRenderer',  // TODO: Create NpcResponseNodeRenderer
    preloadPriority: 8,

    ports: {
      inputs: [
        {
          id: 'input',
          label: 'In',
          position: 'top',
          color: '#3b82f6',
          description: 'Flow into NPC interaction',
        },
        {
          id: 'tool_event',
          label: 'Tool',
          position: 'left',
          color: '#ec4899',
          description: 'Tool interaction events',
        },
      ],
      outputs: [
        {
          id: 'output',
          label: 'Out',
          position: 'bottom',
          color: '#10b981',
          description: 'Continue after interaction',
        },
        {
          id: 'video_params',
          label: 'Video',
          position: 'right',
          color: '#8b5cf6',
          description: 'Generated video parameters',
        },
      ],
    },
  };

  nodeTypeRegistry.register(npcResponseNode);
}
