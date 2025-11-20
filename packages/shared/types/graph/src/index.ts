/**
 * @pixsim7/graph - Canonical graph kernel
 *
 * Execution engine for scene + simulation graphs.
 * Deterministic, pure evaluation with explicit side-effect declarations.
 */

// Re-export generated types and schemas (will be available after generation)
export type * from './generated.js';
export * from './generated.js';

// Runtime types
export interface EvalContext {
  /** Current world/simulation tick */
  tick: number;
  /** Current time of day in minutes (0-1439) */
  timeOfDay: number;
  /** Day of week (0=Sunday, 6=Saturday) */
  dayOfWeek: number;
  /** Entity state (NPC, location, etc.) */
  state: EntityState;
  /** Seeded RNG function */
  rng: () => number;
  /** Lookup function for subgraphs */
  getSubgraph?: (name: string) => any; // Graph type from generated
  /** Variables/context data */
  variables?: Record<string, unknown>;
}

export interface EntityState {
  id: string;
  needs?: Record<string, number>;
  money?: number;
  flags?: Set<string>;
  location?: string;
  activity?: string;
  activityEndsAt?: number; // tick
  relationships?: Record<string, number>;
  cooldowns?: Map<string, number>; // nodeId/edgeId -> tick when available
}

export interface EvalResult {
  /** Effects to apply (declarative) */
  effects: any[]; // EffectDescriptor[] from generated
  /** Instructions for integration layer */
  instructions: Instruction[];
  /** Candidate next node ids */
  nextNodes: string[];
  /** Whether execution is blocked (waiting for choice, timer, scene) */
  blocked?: boolean;
  /** Error if node evaluation failed */
  error?: string;
}

export type Instruction =
  | { kind: 'PlaySegment'; segmentId: string; loop?: boolean; loopWindow?: [number, number] }
  | { kind: 'AwaitChoice'; nodeId: string; edgeIds: string[]; timeout?: number; defaultEdge?: string }
  | { kind: 'Wait'; ticks: number; resumeAt: number }
  | { kind: 'InvokeScene'; sceneRef: string }
  | { kind: 'Log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | { kind: 'SpawnEvent'; eventType: string; data: Record<string, unknown> };

/**
 * Deterministic RNG using xorshift32
 */
export function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  if (x === 0) x = 1; // Avoid zero seed
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x100000000;
  };
}

/**
 * Split RNG for entity-specific streams
 */
export function splitRng(rng: () => number, entityId: string): () => number {
  const hash = hashString(entityId);
  return makeRng(Math.floor(rng() * 0xffffffff) ^ hash);
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash;
  }
  return hash >>> 0;
}

/**
 * Evaluate a condition against context
 */
export function evaluateCondition(condition: any, ctx: EvalContext): boolean {
  const { kind } = condition;

  switch (kind) {
    case 'weekday':
      return ctx.dayOfWeek >= 1 && ctx.dayOfWeek <= 5;
    case 'weekend':
      return ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6;

    case 'timeBetween':
      if (!condition.range) return false;
      return ctx.timeOfDay >= condition.range[0] && ctx.timeOfDay <= condition.range[1];
    case 'timeAfter':
      return ctx.timeOfDay >= (condition.value as number);
    case 'timeBefore':
      return ctx.timeOfDay <= (condition.value as number);

    case 'needLt':
      if (!condition.need) return false;
      return (ctx.state.needs?.[condition.need] ?? 0) < (condition.value as number);
    case 'needGt':
      if (!condition.need) return false;
      return (ctx.state.needs?.[condition.need] ?? 0) > (condition.value as number);
    case 'needBetween':
      if (!condition.need || !condition.range) return false;
      const needVal = ctx.state.needs?.[condition.need] ?? 0;
      return needVal >= condition.range[0] && needVal <= condition.range[1];

    case 'hasFlag':
      return condition.flag ? ctx.state.flags?.has(condition.flag) ?? false : false;
    case 'notFlag':
      return condition.flag ? !(ctx.state.flags?.has(condition.flag) ?? false) : true;
    case 'anyFlag':
      return condition.flags?.some(f => ctx.state.flags?.has(f)) ?? false;
    case 'allFlags':
      return condition.flags?.every(f => ctx.state.flags?.has(f)) ?? false;

    case 'locationIs':
      return ctx.state.location === condition.location;
    case 'locationNot':
      return ctx.state.location !== condition.location;

    case 'moneyGt':
      return (ctx.state.money ?? 0) > (condition.value as number);
    case 'moneyLt':
      return (ctx.state.money ?? 0) < (condition.value as number);

    case 'relationshipGt':
      if (!condition.target) return false;
      return (ctx.state.relationships?.[condition.target] ?? 0) > (condition.value as number);
    case 'relationshipLt':
      if (!condition.target) return false;
      return (ctx.state.relationships?.[condition.target] ?? 0) < (condition.value as number);

    case 'randomChance':
      return ctx.rng() < (condition.probability ?? 0.5);

    case 'tickMod':
      return condition.divisor ? ctx.tick % condition.divisor === 0 : false;

    case 'activityIs':
      return ctx.state.activity === condition.activity;
    case 'activityNot':
      return ctx.state.activity !== condition.activity;

    case 'and':
      return condition.conditions?.every((c: any) => evaluateCondition(c, ctx)) ?? true;
    case 'or':
      return condition.conditions?.some((c: any) => evaluateCondition(c, ctx)) ?? false;
    case 'not':
      return condition.conditions?.[0] ? !evaluateCondition(condition.conditions[0], ctx) : false;

    default:
      console.warn(`Unknown condition kind: ${kind}`);
      return false;
  }
}

/**
 * Check if node can execute (conditions + cooldowns)
 */
export function canExecuteNode(nodeId: string, node: any, ctx: EvalContext): boolean {
  // Check cooldown
  const cooldownEnd = ctx.state.cooldowns?.get(nodeId);
  if (cooldownEnd !== undefined && ctx.tick < cooldownEnd) {
    return false;
  }

  // Check node conditions
  if (node.conditions) {
    return node.conditions.every((c: any) => evaluateCondition(c, ctx));
  }

  return true;
}

/**
 * Evaluate a single node
 */
export function evaluateNode(nodeId: string, node: any, ctx: EvalContext): EvalResult {
  const result: EvalResult = {
    effects: [],
    instructions: [],
    nextNodes: [],
  };

  if (!canExecuteNode(nodeId, node, ctx)) {
    return result; // Node cannot execute
  }

  const { type } = node;

  switch (type) {
    case 'Action': {
      // Collect effects
      if (node.effect) result.effects.push(node.effect);
      if (node.effects) result.effects.push(...node.effects);

      // Continue to next nodes
      result.nextNodes = node.edges ?? [];

      // Apply cooldown if specified
      if (node.cooldownTicks) {
        // Note: cooldown application happens in integration layer
      }
      break;
    }

    case 'Decision': {
      const strategy = node.decisionStrategy ?? 'first';
      const edges = node.edges ?? [];

      if (edges.length === 0) break;

      if (strategy === 'first') {
        // Return first edge (or evaluate edge conditions if available)
        result.nextNodes = [edges[0]];
      } else if (strategy === 'random') {
        const idx = Math.floor(ctx.rng() * edges.length);
        result.nextNodes = [edges[idx]];
      } else if (strategy === 'maxWeight') {
        // Use weights if available
        if (node.weights) {
          let maxWeight = -Infinity;
          let bestEdge = edges[0];
          for (const edge of edges) {
            const weight = node.weights[edge] ?? 0;
            if (weight > maxWeight) {
              maxWeight = weight;
              bestEdge = edge;
            }
          }
          result.nextNodes = [bestEdge];
        } else {
          result.nextNodes = [edges[0]];
        }
      } else {
        result.nextNodes = [edges[0]];
      }
      break;
    }

    case 'Condition': {
      // Conditions are already checked in canExecuteNode
      // If we're here, conditions passed, so continue
      result.nextNodes = node.edges ?? [];
      break;
    }

    case 'Choice': {
      // Block execution and wait for user choice
      result.blocked = true;
      result.instructions.push({
        kind: 'AwaitChoice',
        nodeId,
        edgeIds: node.edges ?? [],
        timeout: node.choiceTimeout,
        defaultEdge: node.choiceDefault,
      });
      break;
    }

    case 'Video': {
      // Select segment
      const segments = node.video?.segments ?? [];
      if (segments.length > 0) {
        const selection = node.selection ?? { kind: 'first' };
        let selectedSegment = segments[0];

        if (selection.kind === 'random') {
          const idx = Math.floor(ctx.rng() * segments.length);
          selectedSegment = segments[idx];
        } else if (selection.kind === 'weighted' && selection.weights) {
          // Weighted selection
          const totalWeight = segments.reduce((sum, seg) =>
            sum + (selection.weights?.[seg.id] ?? seg.weight ?? 1), 0);
          let rand = ctx.rng() * totalWeight;
          for (const seg of segments) {
            const weight = selection.weights[seg.id] ?? seg.weight ?? 1;
            rand -= weight;
            if (rand <= 0) {
              selectedSegment = seg;
              break;
            }
          }
        } else if (selection.kind === 'pool' && selection.tags) {
          // Filter by tags
          const filtered = segments.filter(seg =>
            selection.tags?.some(tag => seg.tags?.includes(tag)));
          if (filtered.length > 0) {
            const idx = Math.floor(ctx.rng() * filtered.length);
            selectedSegment = filtered[idx];
          }
        }

        result.instructions.push({
          kind: 'PlaySegment',
          segmentId: selectedSegment.id,
          loop: node.video?.loop,
          loopWindow: node.video?.loopWindow,
        });
      }

      result.nextNodes = node.edges ?? [];
      break;
    }

    case 'Random': {
      const edges = node.edges ?? [];
      if (edges.length > 0) {
        const idx = Math.floor(ctx.rng() * edges.length);
        result.nextNodes = [edges[idx]];
      }
      break;
    }

    case 'Timer': {
      const duration = node.durationTicks ?? 1;
      result.blocked = true;
      result.instructions.push({
        kind: 'Wait',
        ticks: duration,
        resumeAt: ctx.tick + duration,
      });
      result.nextNodes = node.edges ?? [];
      break;
    }

    case 'SceneCall': {
      if (node.sceneRef) {
        result.blocked = true;
        result.instructions.push({
          kind: 'InvokeScene',
          sceneRef: node.sceneRef,
        });
      }
      result.nextNodes = node.edges ?? [];
      break;
    }

    case 'Subgraph': {
      if (node.subgraph && ctx.getSubgraph) {
        result.instructions.push({
          kind: 'Log',
          level: 'debug',
          message: `Invoking subgraph: ${node.subgraph}`,
        });
        // Integration layer handles subgraph invocation
      }
      result.nextNodes = node.edges ?? [];
      break;
    }

    default:
      result.error = `Unknown node type: ${type}`;
  }

  return result;
}

/**
 * Simple graph executor (single step)
 */
export function executeGraphStep(
  graph: any, // Graph from generated
  currentNodeId: string,
  ctx: EvalContext
): EvalResult {
  const node = graph.nodes[currentNodeId];
  if (!node) {
    return {
      effects: [],
      instructions: [],
      nextNodes: [],
      error: `Node not found: ${currentNodeId}`,
    };
  }

  return evaluateNode(currentNodeId, node, ctx);
}
