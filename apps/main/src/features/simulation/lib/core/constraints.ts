/**
 * Constraint-Driven Simulation (Phase 7)
 *
 * Defines constraints that can be used to automatically run simulations
 * until specific conditions are met.
 */

import type { GameWorldDetail, NpcPresenceDTO } from '@lib/api/game';

import type { SimulationSnapshot } from './history';

/**
 * Base constraint interface
 */
export interface SimulationConstraint {
  id: string;
  type: string;
  description: string;
}

/**
 * World time constraint: run until world time reaches a specific value
 */
export interface WorldTimeConstraint extends SimulationConstraint {
  type: 'worldTime';
  operator: 'gte' | 'lte' | 'eq';
  targetTime: number;
}

/**
 * Flag constraint: run until a session flag reaches a specific value
 */
export interface FlagConstraint extends SimulationConstraint {
  type: 'flag';
  flagPath: string;
  operator: 'eq' | 'neq' | 'gte' | 'lte' | 'exists' | 'notExists';
  targetValue?: unknown;
}

/**
 * NPC location constraint: run until NPC is present at a specific location
 */
export interface NpcLocationConstraint extends SimulationConstraint {
  type: 'npcLocation';
  npcId: number;
  locationId: number;
}

/**
 * Tick count constraint: run for exactly N ticks
 */
export interface TickCountConstraint extends SimulationConstraint {
  type: 'tickCount';
  tickCount: number;
}

/**
 * Event constraint: run until a specific event occurs
 */
export interface EventConstraint extends SimulationConstraint {
  type: 'event';
  eventCategory?: string;
  eventTitlePattern?: string; // regex pattern
}

/**
 * Compound constraint: combine multiple constraints with AND/OR
 */
export interface CompoundConstraint extends SimulationConstraint {
  type: 'compound';
  operator: 'and' | 'or';
  constraints: AnyConstraint[];
}

export type AnyConstraint =
  | WorldTimeConstraint
  | FlagConstraint
  | NpcLocationConstraint
  | TickCountConstraint
  | EventConstraint
  | CompoundConstraint;

/**
 * Context provided to constraint evaluators
 */
export interface ConstraintEvaluationContext {
  worldTime: number;
  worldDetail: GameWorldDetail;
  sessionFlags: Record<string, unknown>;
  npcPresences: NpcPresenceDTO[];
  tickCount: number;
  snapshot?: SimulationSnapshot;
}

/**
 * Result of constraint evaluation
 */
export interface ConstraintEvaluationResult {
  satisfied: boolean;
  progress?: number; // 0-1 indicating progress toward satisfaction
  message?: string;
}

/**
 * Evaluate a world time constraint
 */
function evaluateWorldTimeConstraint(
  constraint: WorldTimeConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { worldTime } = context;
  const { operator, targetTime } = constraint;

  let satisfied = false;
  switch (operator) {
    case 'gte':
      satisfied = worldTime >= targetTime;
      break;
    case 'lte':
      satisfied = worldTime <= targetTime;
      break;
    case 'eq':
      satisfied = worldTime === targetTime;
      break;
  }

  const progress =
    operator === 'gte'
      ? Math.min(1, worldTime / targetTime)
      : operator === 'lte'
      ? 1 - Math.min(1, worldTime / targetTime)
      : satisfied
      ? 1
      : 0;

  return {
    satisfied,
    progress,
    message: satisfied
      ? `World time reached ${worldTime}`
      : `World time: ${worldTime} / ${targetTime}`,
  };
}

/**
 * Get nested value from object by path (e.g., "quest.stage.current")
 */
function getNestedValue(
  obj: Record<string, unknown> | null | undefined,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a flag constraint
 */
function evaluateFlagConstraint(
  constraint: FlagConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { sessionFlags } = context;
  const { flagPath, operator, targetValue } = constraint;

  const currentValue = getNestedValue(sessionFlags, flagPath);
  let satisfied = false;

  switch (operator) {
    case 'eq':
      satisfied = JSON.stringify(currentValue) === JSON.stringify(targetValue);
      break;
    case 'neq':
      satisfied = JSON.stringify(currentValue) !== JSON.stringify(targetValue);
      break;
    case 'exists':
      satisfied = currentValue !== undefined;
      break;
    case 'notExists':
      satisfied = currentValue === undefined;
      break;
    case 'gte':
      satisfied =
        typeof currentValue === 'number' &&
        typeof targetValue === 'number' &&
        currentValue >= targetValue;
      break;
    case 'lte':
      satisfied =
        typeof currentValue === 'number' &&
        typeof targetValue === 'number' &&
        currentValue <= targetValue;
      break;
  }

  return {
    satisfied,
    message: satisfied
      ? `Flag ${flagPath} satisfied`
      : `Flag ${flagPath}: ${JSON.stringify(currentValue)} (waiting for ${JSON.stringify(
          targetValue
        )})`,
  };
}

/**
 * Evaluate an NPC location constraint
 */
function evaluateNpcLocationConstraint(
  constraint: NpcLocationConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { npcPresences } = context;
  const { npcId, locationId } = constraint;

  const presence = npcPresences.find(
    (p) => p.npc_id === npcId && p.location_id === locationId
  );
  const satisfied = !!presence;

  return {
    satisfied,
    message: satisfied
      ? `NPC #${npcId} is at location #${locationId}`
      : `NPC #${npcId} not yet at location #${locationId}`,
  };
}

/**
 * Evaluate a tick count constraint
 */
function evaluateTickCountConstraint(
  constraint: TickCountConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { tickCount } = context;
  const { tickCount: targetCount } = constraint;

  const satisfied = tickCount >= targetCount;
  const progress = Math.min(1, tickCount / targetCount);

  return {
    satisfied,
    progress,
    message: satisfied ? `Ran ${tickCount} ticks` : `Tick ${tickCount} / ${targetCount}`,
  };
}

/**
 * Evaluate an event constraint
 */
function evaluateEventConstraint(
  constraint: EventConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { snapshot } = context;
  if (!snapshot) {
    return { satisfied: false, message: 'No snapshot available' };
  }

  const { eventCategory, eventTitlePattern } = constraint;
  const events = snapshot.events;

  let satisfied = false;
  if (eventCategory && eventTitlePattern) {
    const regex = new RegExp(eventTitlePattern, 'i');
    satisfied = events.some(
      (e) => e.category === eventCategory && regex.test(e.title)
    );
  } else if (eventCategory) {
    satisfied = events.some((e) => e.category === eventCategory);
  } else if (eventTitlePattern) {
    const regex = new RegExp(eventTitlePattern, 'i');
    satisfied = events.some((e) => regex.test(e.title));
  }

  return {
    satisfied,
    message: satisfied
      ? 'Event condition met'
      : `Waiting for event: ${eventCategory || ''} ${eventTitlePattern || ''}`,
  };
}

/**
 * Evaluate a compound constraint
 */
function evaluateCompoundConstraint(
  constraint: CompoundConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  const { operator, constraints } = constraint;

  const results = constraints.map((c) => evaluateConstraint(c, context));

  let satisfied: boolean;
  if (operator === 'and') {
    satisfied = results.every((r) => r.satisfied);
  } else {
    // or
    satisfied = results.some((r) => r.satisfied);
  }

  const satisfiedCount = results.filter((r) => r.satisfied).length;
  const progress = satisfiedCount / results.length;

  return {
    satisfied,
    progress,
    message: `${satisfiedCount}/${results.length} conditions met`,
  };
}

/**
 * Evaluate any constraint
 */
export function evaluateConstraint(
  constraint: AnyConstraint,
  context: ConstraintEvaluationContext
): ConstraintEvaluationResult {
  switch (constraint.type) {
    case 'worldTime':
      return evaluateWorldTimeConstraint(constraint, context);
    case 'flag':
      return evaluateFlagConstraint(constraint, context);
    case 'npcLocation':
      return evaluateNpcLocationConstraint(constraint, context);
    case 'tickCount':
      return evaluateTickCountConstraint(constraint, context);
    case 'event':
      return evaluateEventConstraint(constraint, context);
    case 'compound':
      return evaluateCompoundConstraint(constraint, context);
    default:
      return { satisfied: false, message: 'Unknown constraint type' };
  }
}

/**
 * Create a world time constraint
 */
export function createWorldTimeConstraint(
  operator: 'gte' | 'lte' | 'eq',
  targetTime: number
): WorldTimeConstraint {
  return {
    id: `worldTime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'worldTime',
    description: `World time ${operator} ${targetTime}`,
    operator,
    targetTime,
  };
}

/**
 * Create a flag constraint
 */
export function createFlagConstraint(
  flagPath: string,
  operator: 'eq' | 'neq' | 'gte' | 'lte' | 'exists' | 'notExists',
  targetValue?: unknown
): FlagConstraint {
  return {
    id: `flag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'flag',
    description: `Flag ${flagPath} ${operator} ${JSON.stringify(targetValue)}`,
    flagPath,
    operator,
    targetValue,
  };
}

/**
 * Create an NPC location constraint
 */
export function createNpcLocationConstraint(
  npcId: number,
  locationId: number
): NpcLocationConstraint {
  return {
    id: `npcLoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'npcLocation',
    description: `NPC #${npcId} at location #${locationId}`,
    npcId,
    locationId,
  };
}

/**
 * Create a tick count constraint
 */
export function createTickCountConstraint(tickCount: number): TickCountConstraint {
  return {
    id: `tick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'tickCount',
    description: `Run for ${tickCount} ticks`,
    tickCount,
  };
}

/**
 * Create an event constraint
 */
export function createEventConstraint(
  eventCategory?: string,
  eventTitlePattern?: string
): EventConstraint {
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'event',
    description: `Event: ${eventCategory || ''} ${eventTitlePattern || ''}`,
    eventCategory,
    eventTitlePattern,
  };
}

/**
 * Create a compound constraint
 */
export function createCompoundConstraint(
  operator: 'and' | 'or',
  constraints: AnyConstraint[]
): CompoundConstraint {
  return {
    id: `compound-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'compound',
    description: `${operator.toUpperCase()} of ${constraints.length} constraints`,
    operator,
    constraints,
  };
}
