/**
 * World Config Ordering Parity Tests
 *
 * Verifies that frontend tier/level ordering matches expected behavior.
 * Backend has equivalent tests in pixsim7/backend/main/tests/test_world_config_ordering.py
 */

import { describe, it, expect } from 'vitest';
import {
  getRelationshipTierOrder,
  getIntimacyLevelOrder,
  compareTiers,
  compareLevels,
  levelMeetsMinimum,
  tierMeetsMinimum,
  DEFAULT_WORLD_STATS_CONFIG,
  DEFAULT_RELATIONSHIP_TIERS,
  DEFAULT_INTIMACY_LEVELS,
  type WorldStatsConfig,
  type StatTier,
  type StatLevel,
} from '../worldConfig';

describe('Tier Ordering', () => {
  it('default relationship tiers order: stranger < acquaintance < friend < close_friend < lover', () => {
    const order = getRelationshipTierOrder(DEFAULT_WORLD_STATS_CONFIG);

    expect(order).toEqual(['stranger', 'acquaintance', 'friend', 'close_friend', 'lover']);
  });

  it('custom tiers should be sorted by min value ascending', () => {
    const customTiers: StatTier[] = [
      // Out of order intentionally - non-overlapping tiers
      { id: 'enemy', axis_name: 'affinity', min: -100, max: -50.01 },
      { id: 'hostile', axis_name: 'affinity', min: -50, max: -0.01 },
      { id: 'neutral', axis_name: 'affinity', min: 0, max: 49.99 },
      { id: 'friendly', axis_name: 'affinity', min: 50, max: 89.99 },
      { id: 'best_friend', axis_name: 'affinity', min: 90, max: null },
    ];

    const config: WorldStatsConfig = {
      version: 1,
      definitions: {
        relationships: {
          ...DEFAULT_WORLD_STATS_CONFIG.definitions.relationships,
          tiers: customTiers,
        },
      },
    };

    const order = getRelationshipTierOrder(config);

    // Should be sorted by min value
    expect(order).toEqual(['enemy', 'hostile', 'neutral', 'friendly', 'best_friend']);
  });
});

describe('Level Ordering', () => {
  it('default intimacy levels order by priority: light_flirt < deep_flirt < intimate < very_intimate < soulmates', () => {
    const order = getIntimacyLevelOrder(DEFAULT_WORLD_STATS_CONFIG);

    expect(order).toEqual(['light_flirt', 'deep_flirt', 'intimate', 'very_intimate', 'soulmates']);
  });

  it('custom levels should be sorted by priority ascending', () => {
    const customLevels: StatLevel[] = [
      // Out of order intentionally
      {
        id: 'soulbound',
        conditions: { affinity: { type: 'min', min_value: 99 } },
        priority: 100,
      },
      {
        id: 'casual',
        conditions: { affinity: { type: 'min', min_value: 10 } },
        priority: 1,
      },
      {
        id: 'committed',
        conditions: { affinity: { type: 'min', min_value: 50 } },
        priority: 50,
      },
    ];

    const config: WorldStatsConfig = {
      version: 1,
      definitions: {
        relationships: {
          ...DEFAULT_WORLD_STATS_CONFIG.definitions.relationships,
          levels: customLevels,
        },
      },
    };

    const order = getIntimacyLevelOrder(config);

    // Should be sorted by priority
    expect(order).toEqual(['casual', 'committed', 'soulbound']);
  });
});

describe('compareTiers', () => {
  it('returns negative when first tier is lower', () => {
    expect(compareTiers('stranger', 'friend')).toBeLessThan(0);
    expect(compareTiers('acquaintance', 'lover')).toBeLessThan(0);
  });

  it('returns positive when first tier is higher', () => {
    expect(compareTiers('lover', 'stranger')).toBeGreaterThan(0);
    expect(compareTiers('friend', 'acquaintance')).toBeGreaterThan(0);
  });

  it('returns 0 for equal tiers', () => {
    expect(compareTiers('friend', 'friend')).toBe(0);
  });

  it('handles undefined tiers', () => {
    expect(compareTiers(undefined, 'friend')).toBe(-1);
    expect(compareTiers('friend', undefined)).toBe(1);
    expect(compareTiers(undefined, undefined)).toBe(0);
  });

  it('unknown tiers sort to end', () => {
    expect(compareTiers('unknown_tier', 'stranger')).toBeGreaterThan(0);
    expect(compareTiers('stranger', 'unknown_tier')).toBeLessThan(0);
  });
});

describe('compareLevels', () => {
  it('returns negative when first level is lower', () => {
    expect(compareLevels('light_flirt', 'intimate')).toBeLessThan(0);
    expect(compareLevels('deep_flirt', 'soulmates')).toBeLessThan(0);
  });

  it('returns positive when first level is higher', () => {
    expect(compareLevels('soulmates', 'light_flirt')).toBeGreaterThan(0);
    expect(compareLevels('intimate', 'deep_flirt')).toBeGreaterThan(0);
  });

  it('returns 0 for equal levels', () => {
    expect(compareLevels('intimate', 'intimate')).toBe(0);
  });

  it('handles null/undefined levels', () => {
    expect(compareLevels(null, 'intimate')).toBe(-1);
    expect(compareLevels('intimate', null)).toBe(1);
    expect(compareLevels(undefined, undefined)).toBe(0);
  });
});

describe('levelMeetsMinimum', () => {
  it('returns true when current level meets or exceeds minimum', () => {
    expect(levelMeetsMinimum('intimate', 'light_flirt')).toBe(true);
    expect(levelMeetsMinimum('intimate', 'intimate')).toBe(true);
    expect(levelMeetsMinimum('soulmates', 'deep_flirt')).toBe(true);
  });

  it('returns false when current level is below minimum', () => {
    expect(levelMeetsMinimum('light_flirt', 'intimate')).toBe(false);
    expect(levelMeetsMinimum('deep_flirt', 'soulmates')).toBe(false);
  });

  it('returns false for null/undefined current level', () => {
    expect(levelMeetsMinimum(null, 'light_flirt')).toBe(false);
    expect(levelMeetsMinimum(undefined, 'intimate')).toBe(false);
  });
});

describe('tierMeetsMinimum', () => {
  it('returns true when current tier meets or exceeds minimum', () => {
    expect(tierMeetsMinimum('friend', 'acquaintance')).toBe(true);
    expect(tierMeetsMinimum('lover', 'stranger')).toBe(true);
    expect(tierMeetsMinimum('friend', 'friend')).toBe(true);
  });

  it('returns false when current tier is below minimum', () => {
    expect(tierMeetsMinimum('stranger', 'friend')).toBe(false);
    expect(tierMeetsMinimum('acquaintance', 'lover')).toBe(false);
  });

  it('returns false for undefined current tier', () => {
    expect(tierMeetsMinimum(undefined, 'stranger')).toBe(false);
  });
});

describe('Parity with Backend', () => {
  /**
   * These values MUST match the backend:
   * - pixsim7/backend/main/domain/game/stats/relationships_package.py
   * - pixsim7/backend/main/domain/game/stats/migration.py (get_default_relationship_definition)
   */

  it('default tier thresholds match backend', () => {
    // These thresholds must match backend RelationshipStatsProvider
    expect(DEFAULT_RELATIONSHIP_TIERS).toEqual([
      { id: 'stranger', axis_name: 'affinity', min: 0, max: 9.99 },
      { id: 'acquaintance', axis_name: 'affinity', min: 10, max: 29.99 },
      { id: 'friend', axis_name: 'affinity', min: 30, max: 59.99 },
      { id: 'close_friend', axis_name: 'affinity', min: 60, max: 79.99 },
      { id: 'lover', axis_name: 'affinity', min: 80, max: null },
    ]);
  });

  it('default level priorities match backend', () => {
    // Priority values must match backend RelationshipStatsProvider
    const priorities = DEFAULT_INTIMACY_LEVELS.map((l) => ({ id: l.id, priority: l.priority }));

    expect(priorities).toEqual([
      { id: 'light_flirt', priority: 1 },
      { id: 'deep_flirt', priority: 2 },
      { id: 'intimate', priority: 3 },
      { id: 'very_intimate', priority: 4 },
      { id: 'soulmates', priority: 5 },
    ]);
  });
});
