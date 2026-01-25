/**
 * Behavior System Integration
 *
 * Integrates NPC interactions with the behavior/activity system.
 * Allows behaviors to trigger interactions and interactions to affect behavior.
 */

import type { InteractionDefinition, InteractionParticipant, InteractionTarget } from '@pixsim7/shared.types';

/**
 * Behavior state types
 */
export type BehaviorState =
  | 'idle'
  | 'working'
  | 'sleeping'
  | 'eating'
  | 'socializing'
  | 'traveling'
  | 'custom';

/**
 * Behavior hook for interaction triggering
 */
export interface BehaviorInteractionHook {
  /** When should this hook trigger? */
  trigger: BehaviorHookTrigger;
  /** What interaction should it create/suggest? */
  interaction: InteractionDefinition | string; // ID or full definition
  /** Priority (higher = more likely to trigger) */
  priority?: number;
  /** Conditions for this hook */
  conditions?: BehaviorHookConditions;
}

/**
 * Trigger types for behavior hooks
 */
export interface BehaviorHookTrigger {
  /** Trigger on behavior state change */
  onStateChange?: {
    /** From this state (optional) */
    from?: BehaviorState | BehaviorState[];
    /** To this state */
    to: BehaviorState | BehaviorState[];
  };
  /** Trigger on activity start/end */
  onActivity?: {
    /** Activity IDs to watch */
    activityIds: string[];
    /** When to trigger */
    when: 'start' | 'end' | 'during';
  };
  /** Trigger periodically during a state */
  periodic?: {
    /** While in these states */
    states: BehaviorState[];
    /** Interval in seconds */
    intervalSeconds: number;
  };
  /** Trigger on proximity to player */
  onProximity?: {
    /** Min distance (meters) */
    minDistance?: number;
    /** Max distance (meters) */
    maxDistance: number;
    /** Only while in these states */
    whileInStates?: BehaviorState[];
  };
}

/**
 * Conditions for hook triggering
 */
export interface BehaviorHookConditions {
  /** Min relationship affinity */
  minAffinity?: number;
  /** Max times per day */
  maxPerDay?: number;
  /** Cooldown in seconds */
  cooldownSeconds?: number;
  /** Custom flags required */
  requiredFlags?: string[];
  /** Time of day */
  timeOfDay?: {
    minHour?: number;
    maxHour?: number;
  };
}

/**
 * Interaction intent emitted by behavior system
 */
export interface InteractionIntent {
  /** Unique intent ID */
  id: string;
  /** Target reference */
  target?: InteractionTarget;
  participants?: InteractionParticipant[];
  primaryRole?: string;
  /** Interaction definition ID */
  interactionId: string;
  /** Priority (0-100) */
  priority: number;
  /** When intent was created */
  createdAt: number;
  /** When intent expires */
  expiresAt?: number;
  /** Behavior context */
  behaviorContext: {
    /** Current behavior state */
    currentState: BehaviorState;
    /** Current activity ID */
    currentActivity?: string;
    /** Trigger reason */
    triggerReason: string;
  };
  /** Suggested interaction surface */
  preferredSurface?: 'inline' | 'dialogue' | 'notification';
}

/**
 * Create a behavior hook
 */
export function createBehaviorHook(
  trigger: BehaviorHookTrigger,
  interactionId: string,
  options?: {
    priority?: number;
    conditions?: BehaviorHookConditions;
  }
): BehaviorInteractionHook {
  return {
    trigger,
    interaction: interactionId,
    priority: options?.priority ?? 50,
    conditions: options?.conditions,
  };
}

/**
 * Check if a hook should trigger based on behavior state change
 */
export function shouldTriggerHookOnStateChange(
  hook: BehaviorInteractionHook,
  fromState: BehaviorState,
  toState: BehaviorState
): boolean {
  if (!hook.trigger.onStateChange) return false;

  const trigger = hook.trigger.onStateChange;

  // Check 'from' state
  if (trigger.from) {
    const fromStates = Array.isArray(trigger.from) ? trigger.from : [trigger.from];
    if (!fromStates.includes(fromState)) return false;
  }

  // Check 'to' state
  const toStates = Array.isArray(trigger.to) ? trigger.to : [trigger.to];
  return toStates.includes(toState);
}

/**
 * Check if a hook should trigger for an activity
 */
export function shouldTriggerHookOnActivity(
  hook: BehaviorInteractionHook,
  activityId: string,
  when: 'start' | 'end' | 'during'
): boolean {
  if (!hook.trigger.onActivity) return false;

  const trigger = hook.trigger.onActivity;

  return (
    trigger.activityIds.includes(activityId) &&
    trigger.when === when
  );
}

/**
 * Check if a hook should trigger periodically
 */
export function shouldTriggerHookPeriodically(
  hook: BehaviorInteractionHook,
  currentState: BehaviorState,
  lastTriggerTime: number | undefined,
  currentTime: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!hook.trigger.periodic) return false;

  const trigger = hook.trigger.periodic;

  // Check if in correct state
  if (!trigger.states.includes(currentState)) return false;

  // Check interval
  if (lastTriggerTime) {
    const timeSinceLastTrigger = currentTime - lastTriggerTime;
    return timeSinceLastTrigger >= trigger.intervalSeconds;
  }

  return true; // First trigger
}

/**
 * Check if a hook should trigger based on proximity
 */
export function shouldTriggerHookOnProximity(
  hook: BehaviorInteractionHook,
  distance: number,
  currentState: BehaviorState
): boolean {
  if (!hook.trigger.onProximity) return false;

  const trigger = hook.trigger.onProximity;

  // Check state
  if (trigger.whileInStates && !trigger.whileInStates.includes(currentState)) {
    return false;
  }

  // Check distance range
  if (trigger.minDistance !== undefined && distance < trigger.minDistance) {
    return false;
  }

  if (distance > trigger.maxDistance) {
    return false;
  }

  return true;
}

/**
 * Check if hook conditions are met
 */
export function checkHookConditions(
  conditions: BehaviorHookConditions | undefined,
  context: {
    affinity?: number;
    sessionFlags?: Record<string, any>;
    triggerCount?: number;
    lastTriggerTime?: number;
    currentHour?: number;
  },
  currentTime: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!conditions) return true;

  // Check affinity
  if (conditions.minAffinity !== undefined && context.affinity !== undefined) {
    if (context.affinity < conditions.minAffinity) return false;
  }

  // Check max per day
  if (conditions.maxPerDay !== undefined && context.triggerCount !== undefined) {
    if (context.triggerCount >= conditions.maxPerDay) return false;
  }

  // Check cooldown
  if (conditions.cooldownSeconds && context.lastTriggerTime) {
    const timeSinceLast = currentTime - context.lastTriggerTime;
    if (timeSinceLast < conditions.cooldownSeconds) return false;
  }

  // Check required flags
  if (conditions.requiredFlags && context.sessionFlags) {
    for (const flag of conditions.requiredFlags) {
      if (!context.sessionFlags[flag]) return false;
    }
  }

  // Check time of day
  if (conditions.timeOfDay && context.currentHour !== undefined) {
    const { minHour, maxHour } = conditions.timeOfDay;
    if (minHour !== undefined && context.currentHour < minHour) return false;
    if (maxHour !== undefined && context.currentHour > maxHour) return false;
  }

  return true;
}

/**
 * Create an interaction intent from a behavior hook
 */
export function createIntentFromHook(
  hook: BehaviorInteractionHook,
  target: InteractionTarget,
  behaviorContext: {
    currentState: BehaviorState;
    currentActivity?: string;
    triggerReason: string;
  },
  ttlSeconds: number = 300 // 5 minutes default
): InteractionIntent {
  const now = Math.floor(Date.now() / 1000);
  const interactionId = typeof hook.interaction === 'string'
    ? hook.interaction
    : hook.interaction.id;
  const numericTargetId =
    typeof target.id === 'number' ? target.id : Number(target.id);
  const hasNumericId = Number.isFinite(numericTargetId);
  const targetRef = target.ref ?? (target.kind && hasNumericId ? `${target.kind}:${numericTargetId}` : 'unknown');
  const normalizedTarget =
    target.ref || (target.kind && hasNumericId) ? { ...target, ref: targetRef } : target;

  return {
    id: `intent:${targetRef}:${interactionId}:${now}`,
    target: normalizedTarget,
    participants: [{ role: 'target', ...normalizedTarget }],
    primaryRole: 'target',
    interactionId,
    priority: hook.priority ?? 50,
    createdAt: now,
    expiresAt: now + ttlSeconds,
    behaviorContext,
    preferredSurface: 'notification', // Default, can be overridden
  };
}

/**
 * Filter expired intents
 */
export function filterActiveIntents(
  intents: InteractionIntent[],
  currentTime: number = Math.floor(Date.now() / 1000)
): InteractionIntent[] {
  return intents.filter(
    (intent) => !intent.expiresAt || intent.expiresAt > currentTime
  );
}

/**
 * Get highest priority intent
 */
export function getHighestPriorityIntent(
  intents: InteractionIntent[]
): InteractionIntent | null {
  if (intents.length === 0) return null;

  return intents.reduce((highest, current) =>
    current.priority > highest.priority ? current : highest
  );
}

/**
 * Common behavior hooks for social interactions
 */
export const SOCIAL_BEHAVIOR_HOOKS = {
  /** Greet player when they enter NPC's vicinity while socializing */
  greetOnApproach: (npcId: number): BehaviorInteractionHook =>
    createBehaviorHook(
      {
        onProximity: {
          maxDistance: 5, // 5 meters
          whileInStates: ['idle', 'socializing'],
        },
      },
      `${npcId}:greeting`,
      {
        priority: 70,
        conditions: {
          cooldownSeconds: 3600, // Once per hour
        },
      }
    ),

  /** Offer help when NPC finishes work */
  offerHelpAfterWork: (npcId: number): BehaviorInteractionHook =>
    createBehaviorHook(
      {
        onStateChange: {
          from: 'working',
          to: ['idle', 'socializing'],
        },
      },
      `${npcId}:offer_help`,
      {
        priority: 60,
        conditions: {
          minAffinity: 30,
        },
      }
    ),

  /** Chat periodically while idle */
  chatWhileIdle: (npcId: number): BehaviorInteractionHook =>
    createBehaviorHook(
      {
        periodic: {
          states: ['idle'],
          intervalSeconds: 1800, // 30 minutes
        },
      },
      `${npcId}:idle_chat`,
      {
        priority: 40,
        conditions: {
          minAffinity: 20,
          maxPerDay: 3,
        },
      }
    ),
};

/**
 * Common behavior hooks for romance
 */
export const ROMANCE_BEHAVIOR_HOOKS = {
  /** Flirt when socializing nearby */
  flirtWhileSocializing: (npcId: number): BehaviorInteractionHook =>
    createBehaviorHook(
      {
        periodic: {
          states: ['socializing'],
          intervalSeconds: 2400, // 40 minutes
        },
      },
      `${npcId}:flirt`,
      {
        priority: 80,
        conditions: {
          minAffinity: 50,
          maxPerDay: 2,
          timeOfDay: {
            minHour: 18, // Evening
            maxHour: 23,
          },
        },
      }
    ),
};
