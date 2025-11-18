/**
 * NPC Response Graph System
 * Node-based system for defining complex NPC responses to tool interactions
 * Integrates with AI video generation
 */

import type { InteractiveTool, TouchPattern } from './tools';

// ============================================================================
// Core Graph Types
// ============================================================================

export type NodeId = string;
export type PortId = string;

export interface NodePort {
  id: PortId;
  name: string;
  type: PortType;
  value?: any;
}

export type PortType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'tool'
  | 'pattern'
  | 'expression'
  | 'animation'
  | 'prompt'
  | 'any';

export interface NodeConnection {
  fromNode: NodeId;
  fromPort: PortId;
  toNode: NodeId;
  toPort: PortId;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface BaseNode {
  id: NodeId;
  type: string;
  label: string;
  position: NodePosition;
  inputs: NodePort[];
  outputs: NodePort[];
  data?: Record<string, any>; // Node-specific configuration
}

export interface ResponseGraph {
  id: string;
  name: string;
  description?: string;
  nodes: BaseNode[];
  connections: NodeConnection[];
  version: number;
}

// ============================================================================
// Input/Output Types
// ============================================================================

export interface ToolInputData {
  tool: InteractiveTool;
  pressure: number;
  speed: number;
  pattern?: TouchPattern;
  zone?: string;
  duration: number; // ms
  timestamp: number;
}

export interface VideoGenerationParams {
  prompt: string;
  negativePrompt?: string;
  expression: string;
  animation: string;
  emotion: string;
  intensity: number;
  style?: VideoStyle;
  technical?: TechnicalParams;
  seed?: number;
}

export interface VideoStyle {
  artStyle: 'anime' | 'realistic' | 'semi-realistic' | 'stylized';
  quality: 'draft' | 'standard' | 'high' | 'ultra';
  loras?: string[]; // LoRA model names
  cinematography?: 'closeup' | 'medium' | 'wide' | 'dynamic';
}

export interface TechnicalParams {
  fps: number;
  resolution: string;
  steps: number;
  cfg: number;
  sampler: string;
}

// ============================================================================
// Node Type Definitions
// ============================================================================

export interface InputNode extends BaseNode {
  type: 'input.tool' | 'input.pressure' | 'input.pattern' | 'input.zone' | 'input.duration' | 'input.history';
  data: {
    source: keyof ToolInputData;
  };
}

export interface MathNode extends BaseNode {
  type: 'math.add' | 'math.multiply' | 'math.clamp' | 'math.smooth';
  data: {
    operation: 'add' | 'multiply' | 'clamp' | 'smooth';
    valueA?: number;
    valueB?: number;
    min?: number;
    max?: number;
    smoothing?: number; // 0-1
  };
}

export interface CompareNode extends BaseNode {
  type: 'logic.compare';
  data: {
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
  };
}

export interface AccumulatorNode extends BaseNode {
  type: 'state.accumulator';
  data: {
    initialValue: number;
    decayRate: number; // per second
    min: number;
    max: number;
  };
}

export interface StateMachineNode extends BaseNode {
  type: 'state.machine';
  data: {
    states: StateDefinition[];
    currentState: string;
    transitions: StateTransition[];
  };
}

export interface StateDefinition {
  id: string;
  name: string;
  expression: string;
  animation: string;
  emotion: string;
}

export interface StateTransition {
  from: string;
  to: string;
  condition: 'threshold' | 'timer' | 'event';
  value?: number;
}

export interface PromptBuilderNode extends BaseNode {
  type: 'video.prompt';
  data: {
    template: string; // Template with {placeholders}
    subject: string;
    environment: string;
    style: string;
  };
}

export interface ExpressionNode extends BaseNode {
  type: 'response.expression';
  data: {
    expressions: Record<string, string>; // intensity range -> expression
  };
}

// ============================================================================
// Graph Evaluation Context
// ============================================================================

export interface EvaluationContext {
  input: ToolInputData;
  state: Map<NodeId, any>; // Persistent state per node
  memory: InteractionMemory;
  deltaTime: number; // ms since last evaluation
  timestamp: number;
}

export interface InteractionMemory {
  recentInteractions: ToolInputData[];
  pleasureMeter: number; // 0-1
  arousalLevel: number; // 0-1
  lastToolUsed?: string;
  sessionDuration: number;
  preferences: Record<string, number>; // Tool preferences learned over time
}

// ============================================================================
// Node Registry
// ============================================================================

export type NodeEvaluator = (
  node: BaseNode,
  inputs: Map<PortId, any>,
  context: EvaluationContext
) => Map<PortId, any>;

export interface NodeDefinition {
  type: string;
  category: 'input' | 'logic' | 'math' | 'state' | 'response' | 'video' | 'utility';
  label: string;
  description: string;
  defaultData?: Record<string, any>;
  inputs: Omit<NodePort, 'value'>[];
  outputs: Omit<NodePort, 'value'>[];
  evaluate: NodeEvaluator;
  color?: string;
}

const nodeRegistry = new Map<string, NodeDefinition>();

export function registerNodeType(definition: NodeDefinition): void {
  nodeRegistry.set(definition.type, definition);
}

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return nodeRegistry.get(type);
}

export function getAllNodeDefinitions(): NodeDefinition[] {
  return Array.from(nodeRegistry.values());
}

export function getNodesByCategory(category: NodeDefinition['category']): NodeDefinition[] {
  return Array.from(nodeRegistry.values()).filter(def => def.category === category);
}

// ============================================================================
// Graph Evaluation Engine
// ============================================================================

export class ResponseGraphEvaluator {
  private graph: ResponseGraph;
  private context: EvaluationContext;
  private nodeCache: Map<NodeId, Map<PortId, any>>;

  constructor(graph: ResponseGraph) {
    this.graph = graph;
    this.nodeCache = new Map();
    this.context = {
      input: {
        tool: null as any,
        pressure: 0,
        speed: 0,
        duration: 0,
        timestamp: Date.now(),
      },
      state: new Map(),
      memory: {
        recentInteractions: [],
        pleasureMeter: 0,
        arousalLevel: 0,
        sessionDuration: 0,
        preferences: {},
      },
      deltaTime: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Evaluate the graph with new tool input
   */
  evaluate(input: ToolInputData): VideoGenerationParams | null {
    const now = Date.now();
    this.context.deltaTime = now - this.context.timestamp;
    this.context.timestamp = now;
    this.context.input = input;

    // Update memory
    this.updateMemory(input);

    // Clear cache for new evaluation
    this.nodeCache.clear();

    // Find output nodes (video generation nodes)
    const outputNodes = this.graph.nodes.filter(node =>
      node.type.startsWith('video.') || node.type === 'response.output'
    );

    if (outputNodes.length === 0) {
      console.warn('[ResponseGraph] No output nodes found');
      return null;
    }

    // Evaluate output node (recursive evaluation)
    const outputNode = outputNodes[0]; // Use first output node
    const outputs = this.evaluateNode(outputNode);

    // Extract video generation params
    return this.buildVideoParams(outputs);
  }

  /**
   * Recursively evaluate a node and its dependencies
   */
  private evaluateNode(node: BaseNode): Map<PortId, any> {
    // Check cache
    if (this.nodeCache.has(node.id)) {
      return this.nodeCache.get(node.id)!;
    }

    // Get node definition
    const definition = getNodeDefinition(node.type);
    if (!definition) {
      console.error(`[ResponseGraph] Unknown node type: ${node.type}`);
      return new Map();
    }

    // Evaluate input dependencies
    const inputValues = new Map<PortId, any>();

    for (const inputPort of node.inputs) {
      // Find connection to this input
      const connection = this.graph.connections.find(
        conn => conn.toNode === node.id && conn.toPort === inputPort.id
      );

      if (connection) {
        // Evaluate source node
        const sourceNode = this.graph.nodes.find(n => n.id === connection.fromNode);
        if (sourceNode) {
          const sourceOutputs = this.evaluateNode(sourceNode);
          const value = sourceOutputs.get(connection.fromPort);
          inputValues.set(inputPort.id, value);
        }
      } else {
        // Use default value if no connection
        inputValues.set(inputPort.id, inputPort.value);
      }
    }

    // Evaluate node
    const outputs = definition.evaluate(node, inputValues, this.context);

    // Cache result
    this.nodeCache.set(node.id, outputs);

    return outputs;
  }

  /**
   * Update interaction memory
   */
  private updateMemory(input: ToolInputData): void {
    const memory = this.context.memory;

    // Add to recent interactions (keep last 10)
    memory.recentInteractions.push(input);
    if (memory.recentInteractions.length > 10) {
      memory.recentInteractions.shift();
    }

    // Update session duration
    memory.sessionDuration += this.context.deltaTime;

    // Store last tool
    memory.lastToolUsed = input.tool.id;
  }

  /**
   * Build video generation params from node outputs
   */
  private buildVideoParams(outputs: Map<PortId, any>): VideoGenerationParams {
    return {
      prompt: outputs.get('prompt') || '',
      negativePrompt: outputs.get('negativePrompt'),
      expression: outputs.get('expression') || 'neutral',
      animation: outputs.get('animation') || 'idle',
      emotion: outputs.get('emotion') || 'neutral',
      intensity: outputs.get('intensity') || 0.5,
      style: outputs.get('style'),
      technical: outputs.get('technical'),
      seed: outputs.get('seed'),
    };
  }

  /**
   * Reset graph state
   */
  reset(): void {
    this.context.state.clear();
    this.context.memory = {
      recentInteractions: [],
      pleasureMeter: 0,
      arousalLevel: 0,
      sessionDuration: 0,
      preferences: {},
    };
    this.nodeCache.clear();
  }

  /**
   * Get current context (for debugging)
   */
  getContext(): EvaluationContext {
    return this.context;
  }
}

// ============================================================================
// Graph Serialization
// ============================================================================

export function serializeGraph(graph: ResponseGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function deserializeGraph(json: string): ResponseGraph {
  return JSON.parse(json);
}

export function validateGraph(graph: ResponseGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for cycles
  if (hasCycle(graph)) {
    errors.push('Graph contains cycles');
  }

  // Check all connections reference valid nodes and ports
  for (const conn of graph.connections) {
    const fromNode = graph.nodes.find(n => n.id === conn.fromNode);
    const toNode = graph.nodes.find(n => n.id === conn.toNode);

    if (!fromNode) {
      errors.push(`Connection references invalid source node: ${conn.fromNode}`);
    }
    if (!toNode) {
      errors.push(`Connection references invalid target node: ${conn.toNode}`);
    }

    if (fromNode && !fromNode.outputs.find(p => p.id === conn.fromPort)) {
      errors.push(`Invalid source port: ${conn.fromPort} on node ${conn.fromNode}`);
    }
    if (toNode && !toNode.inputs.find(p => p.id === conn.toPort)) {
      errors.push(`Invalid target port: ${conn.toPort} on node ${conn.toNode}`);
    }
  }

  // Check for at least one output node
  const hasOutput = graph.nodes.some(node =>
    node.type.startsWith('video.') || node.type === 'response.output'
  );
  if (!hasOutput) {
    errors.push('Graph must have at least one output node');
  }

  return { valid: errors.length === 0, errors };
}

function hasCycle(graph: ResponseGraph): boolean {
  const visited = new Set<NodeId>();
  const recursionStack = new Set<NodeId>();

  function dfs(nodeId: NodeId): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    // Get outgoing connections
    const outgoing = graph.connections.filter(conn => conn.fromNode === nodeId);

    for (const conn of outgoing) {
      if (!visited.has(conn.toNode)) {
        if (dfs(conn.toNode)) return true;
      } else if (recursionStack.has(conn.toNode)) {
        return true; // Cycle detected
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}
