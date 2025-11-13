/* AUTO-GENERATED STUB (manual draft) - foundation for graph kernel types
   Schema: graph.schema.json (version 1.0.0)
   NOTE: Replace manual definitions with codegen output later.
*/

export type Graph = {
  schemaVersion: string; // e.g. '1.0.0'
  name: string;
  entry: string;
  nodes: Record<string, GraphNode>;
  metadata?: Record<string, unknown>;
};

export type NodeType =
  | 'Decision'
  | 'Condition'
  | 'Action'
  | 'Choice'
  | 'Video'
  | 'Random'
  | 'Timer'
  | 'SceneCall'
  | 'Subgraph';

export interface BaseNode {
  type: NodeType;
  edges?: string[]; // candidate next node ids
  conditions?: Condition[]; // gating conditions evaluated before node logic
  tags?: string[];
  cooldownTicks?: number;
}

export interface DecisionNode extends BaseNode {
  type: 'Decision';
  // future: decisionStrategy: 'maxWeight' | 'priority'
}
export interface ConditionNode extends BaseNode { type: 'Condition'; }
export interface ActionNode extends BaseNode { type: 'Action'; effect?: EffectDescriptor; }
export interface ChoiceNode extends BaseNode { type: 'Choice'; }
export interface VideoNode extends BaseNode { type: 'Video'; video?: VideoDescriptor; selection?: SelectionStrategy; }
export interface RandomNode extends BaseNode { type: 'Random'; }
export interface TimerNode extends BaseNode { type: 'Timer'; durationTicks?: number; }
export interface SceneCallNode extends BaseNode { type: 'SceneCall'; sceneRef?: string; }
export interface SubgraphNode extends BaseNode { type: 'Subgraph'; subgraph?: string; }

export type GraphNode =
  | DecisionNode
  | ConditionNode
  | ActionNode
  | ChoiceNode
  | VideoNode
  | RandomNode
  | TimerNode
  | SceneCallNode
  | SubgraphNode;

export interface Condition {
  kind: 'weekday' | 'timeBetween' | 'hungerLt' | 'energyLt' | 'hasFlag' | 'notFlag' | 'randomChance';
  value?: unknown; // generic value (e.g., weekday boolean)
  range?: [number, number];
  flag?: string;
  probability?: number; // for randomChance 0..1
}

export interface EffectDescriptor {
  needs?: Record<string, number>; // deltas
  money?: string; // '+wage' '-meal'
  flagsAdd?: string[];
  flagsRemove?: string[];
  moveTo?: string; // location id
  activity?: string; // activity label
}

export interface SelectionStrategy {
  kind: 'ordered' | 'random' | 'pool';
  segmentIds?: string[];
  tags?: string[]; // pool filtering tags
}

export interface VideoDescriptor {
  segments?: VideoSegment[];
  loop?: boolean;
  loopWindow?: [number, number]; // start,end seconds for loop
}

export interface VideoSegment {
  id: string;
  start: number;
  end: number;
  tags?: string[];
}

// Basic runtime instruction types for integration layer (draft)
export type Instruction =
  | { kind: 'PlaySegment'; segmentId: string; loop?: boolean; loopWindow?: [number, number] }
  | { kind: 'AwaitChoice'; nodeId: string; edgeIds: string[] }
  | { kind: 'Wait'; ticks: number }
  | { kind: 'InvokeScene'; sceneRef: string }
  | { kind: 'Log'; message: string };

export interface EvalResult {
  effects: EffectDescriptor[];
  instructions: Instruction[];
  nextNodes: string[]; // candidates for next step (engine will resolve)
}

// Simple pure evaluator placeholder (Decision only picks first available for now)
export function evaluateNode(node: GraphNode, rng: () => number): EvalResult {
  const instructions: Instruction[] = [];
  const effects: EffectDescriptor[] = [];
  let nextNodes: string[] = [];

  switch (node.type) {
    case 'Action':
      if (node.effect) effects.push(node.effect);
      nextNodes = node.edges ?? [];
      break;
    case 'Decision':
      nextNodes = node.edges ? [node.edges[0]] : []; // placeholder strategy
      break;
    case 'Video':
      const seg = node.video?.segments?.[0];
      if (seg) {
        instructions.push({
          kind: 'PlaySegment',
          segmentId: seg.id,
          loop: node.video?.loop,
          loopWindow: node.video?.loopWindow
        });
      }
      nextNodes = node.edges ?? [];
      break;
    case 'Choice':
      if (node.edges && node.edges.length) {
        instructions.push({ kind: 'AwaitChoice', nodeId: 'choice', edgeIds: node.edges });
      }
      break;
    case 'Random':
      if (node.edges && node.edges.length) {
        const pick = Math.floor(rng() * node.edges.length);
        nextNodes = [node.edges[pick]];
      }
      break;
    case 'Timer':
      if (node.durationTicks) instructions.push({ kind: 'Wait', ticks: node.durationTicks });
      nextNodes = node.edges ?? [];
      break;
    case 'SceneCall':
      if (node.sceneRef) instructions.push({ kind: 'InvokeScene', sceneRef: node.sceneRef });
      break;
    case 'Subgraph':
      instructions.push({ kind: 'Log', message: `Subgraph call: ${node.subgraph}` });
      nextNodes = node.edges ?? [];
      break;
    case 'Condition':
      nextNodes = node.edges ?? [];
      break;
    default:
      break;
  }

  return { effects, instructions, nextNodes };
}

// Simple RNG factory (seeded xorshift32)
export function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff);
  };
}
