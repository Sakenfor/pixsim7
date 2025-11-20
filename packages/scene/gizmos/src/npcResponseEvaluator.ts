/**
 * NPC Response Graph Evaluator
 * Evaluates response micro-graphs and generates video parameters
 * Integrates with tool interactions and gizmo system
 */

import type { InteractiveTool, TouchPattern } from './tools';
import type {
  ResponseGraphNode,
  ResponseGraphConnection,
  NpcResponseMetadata,
} from '@pixsim7/shared.types/npcResponseNode';

// ============================================================================
// Evaluation Context
// ============================================================================

export interface ToolInteractionEvent {
  tool: InteractiveTool;
  pressure: number;
  speed: number;
  pattern?: TouchPattern;
  zone?: string;
  duration: number;
  timestamp: number;
}

export interface VideoGenerationOutput {
  prompt: string;
  negativePrompt?: string;
  expression: string;
  animation: string;
  emotion: string;
  intensity: number;
  loras?: string[];
  seed?: number;
  style?: {
    artStyle: string;
    quality: string;
  };
}

interface EvaluationState {
  // Per-node persistent state
  nodeStates: Map<string, any>;
  // Recent interaction history
  history: ToolInteractionEvent[];
  // Current time
  timestamp: number;
  // Time since last evaluation
  deltaTime: number;
}

// ============================================================================
// Response Graph Evaluator
// ============================================================================

export class NpcResponseEvaluator {
  private metadata: NpcResponseMetadata;
  private state: EvaluationState;
  private nodeOutputCache: Map<string, Map<string, any>>;

  constructor(metadata: NpcResponseMetadata) {
    this.metadata = metadata;
    this.state = {
      nodeStates: new Map(),
      history: [],
      timestamp: Date.now(),
      deltaTime: 0,
    };
    this.nodeOutputCache = new Map();
  }

  /**
   * Evaluate the response graph with a new tool interaction
   */
  evaluate(event: ToolInteractionEvent): VideoGenerationOutput | null {
    const now = Date.now();
    this.state.deltaTime = now - this.state.timestamp;
    this.state.timestamp = now;

    // Add to history (keep last 20)
    this.state.history.push(event);
    if (this.state.history.length > 20) {
      this.state.history.shift();
    }

    // Clear output cache for new evaluation
    this.nodeOutputCache.clear();

    // Find output node
    const outputNode = this.metadata.responseGraph.nodes.find(
      n => n.type === 'video.output'
    );

    if (!outputNode) {
      console.warn('[NpcResponseEvaluator] No output node found in graph');
      return null;
    }

    // Evaluate the graph starting from output node (recursive)
    try {
      const outputs = this.evaluateNode(outputNode, event);
      return this.buildVideoOutput(outputs);
    } catch (error) {
      console.error('[NpcResponseEvaluator] Evaluation error:', error);
      return null;
    }
  }

  /**
   * Recursively evaluate a node and its dependencies
   */
  private evaluateNode(
    node: ResponseGraphNode,
    event: ToolInteractionEvent
  ): Map<string, any> {
    // Check cache
    if (this.nodeOutputCache.has(node.id)) {
      return this.nodeOutputCache.get(node.id)!;
    }

    // Get input values by evaluating connected nodes
    const inputs = new Map<string, any>();

    // Find all connections to this node's inputs
    const inputConnections = this.metadata.responseGraph.connections.filter(
      conn => conn.to === node.id
    );

    for (const conn of inputConnections) {
      const sourceNode = this.metadata.responseGraph.nodes.find(
        n => n.id === conn.from
      );
      if (sourceNode) {
        const sourceOutputs = this.evaluateNode(sourceNode, event);
        const value = sourceOutputs.get(conn.fromPort);
        inputs.set(conn.toPort, value);
      }
    }

    // Evaluate this node
    const outputs = this.evaluateNodeType(node, inputs, event);

    // Cache results
    this.nodeOutputCache.set(node.id, outputs);

    return outputs;
  }

  /**
   * Evaluate a specific node type
   */
  private evaluateNodeType(
    node: ResponseGraphNode,
    inputs: Map<string, any>,
    event: ToolInteractionEvent
  ): Map<string, any> {
    const outputs = new Map<string, any>();

    switch (node.type) {
      // Input nodes
      case 'input.tool':
        outputs.set('tool', event.tool.id);
        outputs.set('toolType', event.tool.type);
        break;

      case 'input.pressure':
        outputs.set('value', event.pressure);
        break;

      case 'input.speed':
        outputs.set('value', event.speed);
        break;

      case 'input.pattern':
        outputs.set('pattern', event.pattern || 'none');
        break;

      case 'input.zone':
        outputs.set('zone', event.zone || 'unknown');
        break;

      case 'input.duration':
        outputs.set('value', event.duration);
        break;

      case 'input.history':
        outputs.set('history', this.state.history);
        outputs.set('count', this.state.history.length);
        break;

      // Math nodes
      case 'math.add': {
        const a = inputs.get('a') || inputs.get('input') || 0;
        const b = inputs.get('b') || node.data.value || 0;
        outputs.set('result', a + b);
        outputs.set('value', a + b);
        break;
      }

      case 'math.multiply': {
        const a = inputs.get('a') || 1;
        const b = inputs.get('b') || node.data.value || 1;
        const c = inputs.get('c') || 1;
        outputs.set('result', a * b * c);
        outputs.set('value', a * b * c);
        break;
      }

      case 'math.clamp': {
        const value = inputs.get('value') || inputs.get('input') || 0;
        const min = node.data.min !== undefined ? node.data.min : 0;
        const max = node.data.max !== undefined ? node.data.max : 1;
        const clamped = Math.max(min, Math.min(max, value));
        outputs.set('value', clamped);
        break;
      }

      case 'math.remap': {
        const value = inputs.get('value') || inputs.get('input') || 0;
        const inMin = node.data.inMin || 0;
        const inMax = node.data.inMax || 1;
        const outMin = node.data.outMin || 0;
        const outMax = node.data.outMax || 1;
        const normalized = (value - inMin) / (inMax - inMin);
        const remapped = outMin + normalized * (outMax - outMin);
        outputs.set('value', remapped);
        break;
      }

      // State nodes
      case 'state.accumulator': {
        const nodeState = this.getNodeState(node.id, {
          value: node.data.initialValue || 0,
        });

        // Decay over time
        const decayRate = node.data.decayRate || 0;
        const decayAmount = (decayRate * this.state.deltaTime) / 1000;
        nodeState.value = Math.max(0, nodeState.value - decayAmount);

        // Add input
        const input = inputs.get('input') || inputs.get('value') || 0;
        nodeState.value += input;

        // Clamp
        const min = node.data.min !== undefined ? node.data.min : 0;
        const max = node.data.max !== undefined ? node.data.max : 1;
        nodeState.value = Math.max(min, Math.min(max, nodeState.value));

        this.setNodeState(node.id, nodeState);
        outputs.set('value', nodeState.value);
        break;
      }

      case 'state.machine': {
        const intensity = inputs.get('intensity') || 0;
        const states = node.data.states || [];
        const transitions = node.data.transitions || [];

        const nodeState = this.getNodeState(node.id, {
          currentState: states[0]?.id || 'default',
        });

        // Check for state transitions
        for (const transition of transitions) {
          if (nodeState.currentState === transition.from) {
            if (intensity >= (transition.threshold || 0)) {
              nodeState.currentState = transition.to;
              this.setNodeState(node.id, nodeState);
            }
          }
        }

        // Get current state data
        const currentStateData = states.find(s => s.id === nodeState.currentState) || states[0];
        if (currentStateData) {
          outputs.set('state', currentStateData.id);
          outputs.set('expression', currentStateData.expression || 'neutral');
          outputs.set('animation', currentStateData.animation || 'idle');
          outputs.set('emotion', currentStateData.emotion || 'neutral');
        }
        break;
      }

      case 'state.memory': {
        const key = inputs.get('key') || node.data.key || 'default';
        const initial = node.data.initial || {};
        const value = initial[key] !== undefined ? initial[key] : null;
        outputs.set('value', value);
        break;
      }

      // Logic nodes
      case 'logic.compare': {
        const a = inputs.get('a') || inputs.get('value') || 0;
        const b = inputs.get('b') || node.data.threshold || 0;
        const operator = node.data.operator || '>';

        let result = false;
        switch (operator) {
          case '>': result = a > b; break;
          case '<': result = a < b; break;
          case '>=': result = a >= b; break;
          case '<=': result = a <= b; break;
          case '==': result = a === b; break;
          case '!=': result = a !== b; break;
        }

        outputs.set('result', result);
        outputs.set('value', result ? 1 : 0);
        break;
      }

      // Response nodes
      case 'response.expression': {
        const intensity = inputs.get('intensity') || 0;
        const thresholds = node.data.thresholds || {
          0: 'neutral',
          0.3: 'interested',
          0.6: 'pleased',
          0.8: 'ecstatic',
        };

        // Find the appropriate expression based on intensity
        let expression = 'neutral';
        const sortedThresholds = Object.keys(thresholds)
          .map(k => parseFloat(k))
          .sort((a, b) => b - a); // Descending order

        for (const threshold of sortedThresholds) {
          if (intensity >= threshold) {
            expression = thresholds[threshold];
            break;
          }
        }

        outputs.set('expression', expression);
        break;
      }

      case 'response.animation': {
        const state = inputs.get('state') || 'idle';
        const animations = node.data.animations || { idle: 'idle' };
        outputs.set('animation', animations[state] || state);
        break;
      }

      case 'response.emotion': {
        const intensity = inputs.get('intensity') || 0;
        const emotions = node.data.emotions || {
          0: 'neutral',
          0.5: 'pleasure',
          0.8: 'bliss',
        };

        let emotion = 'neutral';
        const sorted = Object.keys(emotions)
          .map(k => parseFloat(k))
          .sort((a, b) => b - a);

        for (const threshold of sorted) {
          if (intensity >= threshold) {
            emotion = emotions[threshold];
            break;
          }
        }

        outputs.set('emotion', emotion);
        break;
      }

      case 'response.intensity': {
        const value = inputs.get('value') || inputs.get('input') || 0;
        outputs.set('intensity', Math.max(0, Math.min(1, value)));
        break;
      }

      // Video generation nodes
      case 'video.prompt': {
        let template = node.data.template || '{expression}';

        // Replace placeholders
        const placeholders = {
          expression: inputs.get('expression') || 'neutral',
          animation: inputs.get('animation') || 'idle',
          emotion: inputs.get('emotion') || 'neutral',
          state: inputs.get('state') || 'default',
        };

        for (const [key, value] of Object.entries(placeholders)) {
          template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }

        // Combine with base prompt
        const basePrompt = this.metadata.videoGen.basePrompt || '';
        const finalPrompt = basePrompt ? `${basePrompt}, ${template}` : template;

        outputs.set('prompt', finalPrompt);
        break;
      }

      case 'video.lora': {
        const state = inputs.get('state') || 'neutral';
        const loras = node.data.loras || {};
        const selectedLoras = loras[state] || [];
        outputs.set('loras', selectedLoras);
        break;
      }

      case 'video.output': {
        // Pass through all inputs
        inputs.forEach((value, key) => {
          outputs.set(key, value);
        });
        break;
      }

      default:
        console.warn(`[NpcResponseEvaluator] Unknown node type: ${node.type}`);
    }

    // Log if debug enabled
    if (this.metadata.debug?.logEvaluations) {
      console.log(`[Node ${node.id}] Type: ${node.type}`, {
        inputs: Object.fromEntries(inputs),
        outputs: Object.fromEntries(outputs),
      });
    }

    return outputs;
  }

  /**
   * Build final video generation output from node outputs
   */
  private buildVideoOutput(outputs: Map<string, any>): VideoGenerationOutput {
    return {
      prompt: outputs.get('prompt') || '',
      negativePrompt: outputs.get('negativePrompt'),
      expression: outputs.get('expression') || 'neutral',
      animation: outputs.get('animation') || 'idle',
      emotion: outputs.get('emotion') || 'neutral',
      intensity: outputs.get('intensity') || 0.5,
      loras: outputs.get('loras') || this.metadata.videoGen.style?.loras,
      seed: outputs.get('seed'),
      style: this.metadata.videoGen.style,
    };
  }

  /**
   * Get node state
   */
  private getNodeState(nodeId: string, defaultState: any): any {
    if (!this.state.nodeStates.has(nodeId)) {
      this.state.nodeStates.set(nodeId, { ...defaultState });
    }
    return this.state.nodeStates.get(nodeId)!;
  }

  /**
   * Set node state
   */
  private setNodeState(nodeId: string, state: any): void {
    this.state.nodeStates.set(nodeId, state);
  }

  /**
   * Reset evaluator state
   */
  reset(): void {
    this.state = {
      nodeStates: new Map(),
      history: [],
      timestamp: Date.now(),
      deltaTime: 0,
    };
    this.nodeOutputCache.clear();
  }

  /**
   * Get current state (for debugging)
   */
  getState(): EvaluationState {
    return this.state;
  }
}
