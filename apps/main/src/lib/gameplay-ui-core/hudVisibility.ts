/**
 * Gameplay UI Core - HUD Visibility Conditions
 *
 * Advanced visibility conditions for HUD widgets based on game state.
 * Maps to UnifiedVisibility.advanced from editing-core.
 *
 * Part of the "Editable UI Core" architecture:
 * - editing-core: Generic visibility (simple triggers)
 * - gameplay-ui-core: HUD visibility (quest/location/time-based) (this file)
 */

import type { AdvancedVisibilityCondition } from '../editing-core';
import type { WorldToolContext } from '../worldTools/context';

/**
 * HUD visibility condition kinds
 *
 * These are game-specific visibility rules that go beyond simple
 * hover/focus/always triggers.
 */
export type HudVisibilityKind =
  | 'capability'    // When a specific capability is enabled
  | 'flag'          // When a session flag is set
  | 'session'       // Only when a session exists
  | 'location'      // At specific locations
  | 'time'          // During specific time windows
  | 'quest'         // When a quest is active
  | 'relationship'  // Based on NPC relationship level
  | 'composite';    // Composite condition (AND/OR)

/**
 * HUD-specific visibility condition
 *
 * This is a more detailed version than UnifiedVisibility.advanced,
 * specifically for HUD/gameplay use cases.
 */
export interface HudVisibilityCondition {
  /** Type of condition */
  kind: HudVisibilityKind;

  /** Identifier for the condition (e.g., capability ID, flag path, location ID) */
  id: string;

  /** For 'time' condition: day of week (0-6) or 'any' */
  dayOfWeek?: number | 'any';

  /** For 'time' condition: hour range [start, end] (24-hour format) */
  hourRange?: [number, number];

  /** For 'relationship' condition: minimum relationship level (0-100) */
  minRelationship?: number;

  /** For 'composite' condition: logical operator */
  operator?: 'AND' | 'OR';

  /** For 'composite' condition: nested conditions */
  conditions?: HudVisibilityCondition[];
}

/**
 * Convert HudVisibilityCondition to generic AdvancedVisibilityCondition
 *
 * This allows HUD visibility to be stored in the unified config format.
 */
export function toAdvancedVisibilityCondition(
  hud: HudVisibilityCondition
): AdvancedVisibilityCondition {
  return {
    id: hud.id,
    type: hud.kind,
    params: {
      dayOfWeek: hud.dayOfWeek,
      hourRange: hud.hourRange,
      minRelationship: hud.minRelationship,
      operator: hud.operator,
      conditions: hud.conditions?.map(toAdvancedVisibilityCondition),
    },
  };
}

/**
 * Convert generic AdvancedVisibilityCondition to HudVisibilityCondition
 *
 * This allows unified configs to be interpreted as HUD visibility.
 */
export function fromAdvancedVisibilityCondition(
  advanced: AdvancedVisibilityCondition
): HudVisibilityCondition {
  return {
    kind: advanced.type as HudVisibilityKind,
    id: advanced.id,
    dayOfWeek: advanced.params?.dayOfWeek as number | 'any' | undefined,
    hourRange: advanced.params?.hourRange as [number, number] | undefined,
    minRelationship: advanced.params?.minRelationship as number | undefined,
    operator: advanced.params?.operator as 'AND' | 'OR' | undefined,
    conditions: advanced.params?.conditions
      ? (advanced.params.conditions as AdvancedVisibilityCondition[]).map(
          fromAdvancedVisibilityCondition
        )
      : undefined,
  };
}

/**
 * Evaluate a HUD visibility condition against the current game context
 *
 * @param condition - The visibility condition to evaluate
 * @param context - Current world/session/game context
 * @returns true if the condition is met and the widget should be visible
 */
export function evaluateHudVisibility(
  condition: HudVisibilityCondition,
  context: WorldToolContext
): boolean {
  switch (condition.kind) {
    case 'session':
      // Visible only when session exists
      return context.session !== null;

    case 'flag':
      // Visible when session flag is set
      if (!context.session || !context.sessionFlags) return false;
      return Boolean(context.sessionFlags[condition.id]);

    case 'capability':
      // Visible when capability is enabled
      // Note: This would need access to capabilities, which may need to be added to context
      return true; // Placeholder

    case 'location':
      // Visible at specific locations
      return context.selectedLocationId?.toString() === condition.id;

    case 'time':
      // Visible during specific time windows
      if (!condition.hourRange && !condition.dayOfWeek) return true;

      const { worldTime } = context;
      if (!worldTime) return false;

      // Check day of week (if specified)
      if (condition.dayOfWeek !== undefined && condition.dayOfWeek !== 'any') {
        const dayOfWeek = worldTime.day % 7;
        if (dayOfWeek !== condition.dayOfWeek) return false;
      }

      // Check hour range (if specified)
      if (condition.hourRange) {
        const [start, end] = condition.hourRange;
        const hour = worldTime.hour;
        if (hour < start || hour >= end) return false;
      }

      return true;

    case 'quest':
      // Visible when specific quest is active
      // Note: This would need access to active quests in context
      return true; // Placeholder

    case 'relationship':
      // Visible based on NPC relationship level
      if (!condition.minRelationship || !context.relationships) return true;

      const relationshipLevel = context.relationships[condition.id];
      if (typeof relationshipLevel !== 'number') return false;

      return relationshipLevel >= condition.minRelationship;

    case 'composite':
      // Composite condition with AND/OR logic
      if (!condition.conditions || condition.conditions.length === 0) return true;

      const results = condition.conditions.map((c) =>
        evaluateHudVisibility(c, context)
      );

      if (condition.operator === 'OR') {
        return results.some((r) => r);
      } else {
        // Default to AND
        return results.every((r) => r);
      }

    default:
      console.warn(`Unknown HUD visibility kind: ${condition.kind}`);
      return true;
  }
}

/**
 * Evaluate multiple conditions (treated as AND by default)
 */
export function evaluateHudVisibilityConditions(
  conditions: HudVisibilityCondition[],
  context: WorldToolContext
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateHudVisibility(c, context));
}

/**
 * Helper to create common visibility conditions
 */
export const HudVisibilityHelpers = {
  /**
   * Create a session-only condition
   */
  requireSession(): HudVisibilityCondition {
    return {
      kind: 'session',
      id: 'session-required',
    };
  },

  /**
   * Create a location-based condition
   */
  atLocation(locationId: number): HudVisibilityCondition {
    return {
      kind: 'location',
      id: locationId.toString(),
    };
  },

  /**
   * Create a time-based condition
   */
  duringHours(start: number, end: number, dayOfWeek?: number | 'any'): HudVisibilityCondition {
    return {
      kind: 'time',
      id: `time-${start}-${end}`,
      hourRange: [start, end],
      dayOfWeek,
    };
  },

  /**
   * Create a quest-based condition
   */
  whenQuestActive(questId: string): HudVisibilityCondition {
    return {
      kind: 'quest',
      id: questId,
    };
  },

  /**
   * Create a relationship-based condition
   */
  whenRelationship(npcId: string, minLevel: number): HudVisibilityCondition {
    return {
      kind: 'relationship',
      id: npcId,
      minRelationship: minLevel,
    };
  },

  /**
   * Create a flag-based condition
   */
  whenFlagSet(flagPath: string): HudVisibilityCondition {
    return {
      kind: 'flag',
      id: flagPath,
    };
  },

  /**
   * Combine multiple conditions with AND
   */
  and(...conditions: HudVisibilityCondition[]): HudVisibilityCondition {
    return {
      kind: 'composite',
      id: 'composite-and',
      operator: 'AND',
      conditions,
    };
  },

  /**
   * Combine multiple conditions with OR
   */
  or(...conditions: HudVisibilityCondition[]): HudVisibilityCondition {
    return {
      kind: 'composite',
      id: 'composite-or',
      operator: 'OR',
      conditions,
    };
  },
};
