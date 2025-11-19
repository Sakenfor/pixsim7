/**
 * Dynamic Theme Rules
 *
 * Allow themes to automatically change based on world state
 * (time of day, arc progression, relationship levels, etc.)
 */

import type { GameWorldDetail, GameSessionDTO, WorldUiTheme } from '@pixsim7/types';

/**
 * Condition type for theme rules
 */
export type ThemeRuleCondition =
  | { type: 'timeRange'; startHour: number; endHour: number }
  | { type: 'worldTime'; minTime: number; maxTime: number }
  | { type: 'relationshipLevel'; npcId: number; minLevel: number }
  | { type: 'flag'; flagKey: string; value: any }
  | { type: 'arcActive'; arcId: string }
  | { type: 'turnNumber'; minTurn: number; maxTurn?: number }
  | { type: 'always' };

/**
 * A rule that maps conditions to theme overrides
 */
export interface DynamicThemeRule {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of when this rule applies */
  description?: string;
  /** Priority (higher = evaluated first) */
  priority: number;
  /** Conditions that must be met */
  conditions: ThemeRuleCondition[];
  /** Theme override to apply when conditions are met */
  themeOverride: Partial<WorldUiTheme>;
  /** Whether this rule is enabled */
  enabled: boolean;
}

/**
 * Built-in dynamic theme rule presets
 */
export const DYNAMIC_THEME_RULE_PRESETS: DynamicThemeRule[] = [
  {
    id: 'time-of-day-night',
    name: 'Night Time (18:00-6:00)',
    description: 'Dark theme during night hours',
    priority: 10,
    enabled: true,
    conditions: [
      { type: 'timeRange', startHour: 18, endHour: 6 },
    ],
    themeOverride: {
      colors: {
        background: '#0a0a0f',
        text: '#e0e0e0',
        primary: '#6366f1',
        secondary: '#8b5cf6',
      },
      motion: 'calm',
    },
  },
  {
    id: 'time-of-day-dawn',
    name: 'Dawn (6:00-9:00)',
    description: 'Soft pastel theme during early morning',
    priority: 9,
    enabled: true,
    conditions: [
      { type: 'timeRange', startHour: 6, endHour: 9 },
    ],
    themeOverride: {
      colors: {
        background: '#fff7ed',
        text: '#431407',
        primary: '#f59e0b',
        secondary: '#fb923c',
      },
      motion: 'calm',
    },
  },
  {
    id: 'time-of-day-day',
    name: 'Daytime (9:00-18:00)',
    description: 'Bright theme during day hours',
    priority: 8,
    enabled: true,
    conditions: [
      { type: 'timeRange', startHour: 9, endHour: 18 },
    ],
    themeOverride: {
      colors: {
        background: '#ffffff',
        text: '#1f2937',
        primary: '#3b82f6',
        secondary: '#8b5cf6',
      },
    },
  },
  {
    id: 'high-relationship',
    name: 'High Relationship (Romance)',
    description: 'Warm romantic theme when relationship is high',
    priority: 15,
    enabled: false, // Disabled by default, requires configuration
    conditions: [
      { type: 'relationshipLevel', npcId: 0, minLevel: 80 },
    ],
    themeOverride: {
      colors: {
        primary: '#ec4899',
        secondary: '#f472b6',
        background: '#fdf2f8',
      },
      motion: 'calm',
    },
  },
];

/**
 * Extract hour from world_time (assuming seconds since epoch or game start)
 */
function getHourFromWorldTime(worldTime: number): number {
  // Assuming world_time is in seconds, get hour of day (0-23)
  const secondsInDay = 86400;
  const secondsInHour = 3600;
  const timeOfDay = worldTime % secondsInDay;
  return Math.floor(timeOfDay / secondsInHour);
}

/**
 * Check if a condition is met
 */
function evaluateCondition(
  condition: ThemeRuleCondition,
  world: GameWorldDetail,
  session?: GameSessionDTO
): boolean {
  switch (condition.type) {
    case 'always':
      return true;

    case 'timeRange': {
      const hour = getHourFromWorldTime(world.world_time);
      const { startHour, endHour } = condition;

      // Handle ranges that cross midnight
      if (startHour > endHour) {
        return hour >= startHour || hour < endHour;
      }
      return hour >= startHour && hour < endHour;
    }

    case 'worldTime':
      return world.world_time >= condition.minTime &&
             world.world_time <= condition.maxTime;

    case 'relationshipLevel': {
      if (!session || !session.relationships) return false;
      const npcKey = `npc_${condition.npcId}`;
      const relationship = session.relationships[npcKey];
      if (!relationship || typeof relationship !== 'object') return false;
      const level = (relationship as any).level || 0;
      return level >= condition.minLevel;
    }

    case 'flag': {
      if (!session || !session.flags) return false;
      return session.flags[condition.flagKey] === condition.value;
    }

    case 'arcActive': {
      if (!session || !session.flags) return false;
      const arcs = (session.flags as any).arcs;
      if (!arcs || typeof arcs !== 'object') return false;
      const arc = arcs[condition.arcId];
      return arc && (arc as any).status === 'active';
    }

    case 'turnNumber': {
      if (!session || !session.flags) return false;
      const world = (session.flags as any).world;
      if (!world || typeof world !== 'object') return false;
      const turnNumber = (world as any).turnNumber || 0;
      const meetsMin = turnNumber >= condition.minTurn;
      const meetsMax = condition.maxTurn === undefined || turnNumber <= condition.maxTurn;
      return meetsMin && meetsMax;
    }

    default:
      console.warn('Unknown condition type:', (condition as any).type);
      return false;
  }
}

/**
 * Check if a rule matches current world/session state
 */
function evaluateRule(
  rule: DynamicThemeRule,
  world: GameWorldDetail,
  session?: GameSessionDTO
): boolean {
  if (!rule.enabled) return false;

  // All conditions must be met
  return rule.conditions.every(condition =>
    evaluateCondition(condition, world, session)
  );
}

/**
 * Find the first matching rule (by priority)
 */
export function findMatchingRule(
  rules: DynamicThemeRule[],
  world: GameWorldDetail,
  session?: GameSessionDTO
): DynamicThemeRule | undefined {
  // Sort by priority (highest first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return sortedRules.find(rule => evaluateRule(rule, world, session));
}

/**
 * Get theme override from matching rule
 */
export function getDynamicThemeOverride(
  rules: DynamicThemeRule[],
  world: GameWorldDetail,
  session?: GameSessionDTO
): Partial<WorldUiTheme> | undefined {
  const matchingRule = findMatchingRule(rules, world, session);
  return matchingRule?.themeOverride;
}

/**
 * Merge base theme with dynamic rule override
 */
export function applyDynamicThemeRule(
  baseTheme: WorldUiTheme | undefined,
  ruleOverride: Partial<WorldUiTheme> | undefined
): WorldUiTheme | undefined {
  if (!ruleOverride) return baseTheme;

  if (!baseTheme) {
    // Create theme from override
    return {
      id: 'dynamic',
      ...ruleOverride,
    } as WorldUiTheme;
  }

  // Merge colors
  const mergedColors = {
    ...(baseTheme.colors || {}),
    ...(ruleOverride.colors || {}),
  };

  return {
    ...baseTheme,
    ...ruleOverride,
    id: `${baseTheme.id}+dynamic`,
    colors: Object.keys(mergedColors).length > 0 ? mergedColors : undefined,
  };
}

/**
 * Storage key for user's dynamic theme rules
 */
const STORAGE_KEY = 'pixsim7:dynamicThemeRules';

/**
 * Load user's dynamic theme rules from localStorage
 */
export function loadDynamicThemeRules(): DynamicThemeRule[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [...DYNAMIC_THEME_RULE_PRESETS];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [...DYNAMIC_THEME_RULE_PRESETS];
  } catch (err) {
    console.error('Failed to load dynamic theme rules', err);
    return [...DYNAMIC_THEME_RULE_PRESETS];
  }
}

/**
 * Save dynamic theme rules to localStorage
 */
export function saveDynamicThemeRules(rules: DynamicThemeRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to save dynamic theme rules', err);
  }
}

/**
 * Add or update a dynamic theme rule
 */
export function saveOrUpdateRule(rule: DynamicThemeRule): void {
  const rules = loadDynamicThemeRules();
  const index = rules.findIndex(r => r.id === rule.id);

  if (index >= 0) {
    rules[index] = rule;
  } else {
    rules.push(rule);
  }

  saveDynamicThemeRules(rules);
}

/**
 * Delete a dynamic theme rule
 */
export function deleteRule(ruleId: string): boolean {
  const rules = loadDynamicThemeRules();
  const filtered = rules.filter(r => r.id !== ruleId);

  if (filtered.length === rules.length) {
    return false; // Rule not found
  }

  saveDynamicThemeRules(filtered);
  return true;
}

/**
 * Toggle rule enabled state
 */
export function toggleRuleEnabled(ruleId: string): void {
  const rules = loadDynamicThemeRules();
  const rule = rules.find(r => r.id === ruleId);

  if (rule) {
    rule.enabled = !rule.enabled;
    saveDynamicThemeRules(rules);
  }
}

/**
 * Reset to default rules
 */
export function resetToDefaultRules(): void {
  saveDynamicThemeRules([...DYNAMIC_THEME_RULE_PRESETS]);
}

/**
 * Create a simple time-of-day rule
 */
export function createTimeOfDayRule(
  id: string,
  name: string,
  startHour: number,
  endHour: number,
  themeOverride: Partial<WorldUiTheme>,
  priority: number = 10
): DynamicThemeRule {
  return {
    id,
    name,
    priority,
    enabled: true,
    conditions: [{ type: 'timeRange', startHour, endHour }],
    themeOverride,
  };
}
