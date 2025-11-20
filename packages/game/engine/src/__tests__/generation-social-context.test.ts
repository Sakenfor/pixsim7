/**
 * Tests for Generation Social Context System
 *
 * Regression tests to ensure relationship metrics consistently map to
 * social context and that world/user constraints are properly enforced.
 *
 * @status REFERENCE_IMPLEMENTATION
 * These tests serve as documentation and regression anchors.
 * Run with: npm test packages/game-core
 */

import { describe, it, expect } from 'vitest';
import { buildGenerationSocialContext } from '../relationships/socialContext';
import {
  validateGenerationNode,
  isGenerationNodeValid,
} from '../generation/validator';
import type { GameSessionDTO, GameWorldDetail, GenerationNodeConfig } from '@pixsim7/shared.types';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a minimal session for testing
 */
function createTestSession(relationships: Record<string, any> = {}): GameSessionDTO {
  return {
    id: 1,
    user_id: 1,
    scene_id: 1,
    current_node_id: 1,
    flags: {},
    relationships,
    world_time: 0,
    version: 1,
  };
}

/**
 * Create a test world with generation config
 */
function createTestWorld(
  generationConfig?: Record<string, any>
): GameWorldDetail {
  return {
    id: 1,
    name: 'Test World',
    meta: {
      generation: generationConfig,
    },
    world_time: 0,
  };
}

/**
 * Create a test generation node config
 */
function createTestNodeConfig(
  overrides?: Partial<GenerationNodeConfig>
): GenerationNodeConfig {
  return {
    generationType: 'transition',
    purpose: 'gap_fill',
    style: {},
    duration: { min: 10, max: 30, target: 20 },
    constraints: {},
    strategy: 'per_playthrough',
    fallback: { mode: 'skip' },
    enabled: true,
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// Social Context Mapping Tests
// ============================================================================

describe('buildGenerationSocialContext', () => {
  it('should return none/sfw for no relationship', () => {
    const session = createTestSession();
    const context = buildGenerationSocialContext(session, undefined, [12]);

    expect(context.intimacyBand).toBe('none');
    expect(context.contentRating).toBe('sfw');
  });

  it('should map light_flirt to light band and romantic rating', () => {
    const session = createTestSession({
      'npc:12': {
        affinity: 25,
        trust: 20,
        chemistry: 25,
        tension: 5,
        tierId: 'friend',
        intimacyLevelId: 'light_flirt',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12]);

    expect(context.intimacyLevelId).toBe('light_flirt');
    expect(context.intimacyBand).toBe('light');
    expect(context.contentRating).toBe('romantic');
    expect(context.relationshipTierId).toBe('friend');
  });

  it('should map intimate to deep band and mature_implied rating', () => {
    const session = createTestSession({
      'npc:12': {
        affinity: 65,
        trust: 50,
        chemistry: 65,
        tension: 10,
        tierId: 'close_friend',
        intimacyLevelId: 'intimate',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12]);

    expect(context.intimacyLevelId).toBe('intimate');
    expect(context.intimacyBand).toBe('deep');
    expect(context.contentRating).toBe('mature_implied');
    expect(context.relationshipTierId).toBe('close_friend');
  });

  it('should map very_intimate to intense band', () => {
    const session = createTestSession({
      'npc:12': {
        affinity: 85,
        trust: 70,
        chemistry: 85,
        tension: 15,
        tierId: 'lover',
        intimacyLevelId: 'very_intimate',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12]);

    expect(context.intimacyLevelId).toBe('very_intimate');
    expect(context.intimacyBand).toBe('intense');
    expect(context.relationshipTierId).toBe('lover');
  });

  it('should clamp rating by world maxContentRating', () => {
    const session = createTestSession({
      'npc:12': {
        intimacyLevelId: 'very_intimate',
        tierId: 'lover',
      },
    });

    const world = createTestWorld({ maxContentRating: 'romantic' });
    const context = buildGenerationSocialContext(session, world, [12]);

    // Should be clamped from mature_implied to romantic
    expect(context.contentRating).toBe('romantic');
  });

  it('should reduce intensity when configured', () => {
    const session = createTestSession({
      'npc:12': {
        intimacyLevelId: 'intimate',
        tierId: 'close_friend',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12], {
      reduceIntensity: true,
    });

    // Intimate is normally 'deep', should be reduced to 'light'
    expect(context.intimacyBand).toBe('light');
  });

  it('should use highest intimacy level for multiple NPCs', () => {
    const session = createTestSession({
      'npc:12': {
        intimacyLevelId: 'light_flirt',
        tierId: 'friend',
      },
      'npc:13': {
        intimacyLevelId: 'intimate',
        tierId: 'close_friend',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12, 13]);

    // Should use intimate (deeper than light_flirt)
    expect(context.intimacyLevelId).toBe('intimate');
    expect(context.intimacyBand).toBe('deep');
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateGenerationNode', () => {
  it('should pass validation for basic node', () => {
    const config = createTestNodeConfig();
    const result = validateGenerationNode(config);

    expect(result.errors).toHaveLength(0);
    expect(isGenerationNodeValid(config)).toBe(true);
  });

  it('should error when social context exceeds world max rating', () => {
    const config = createTestNodeConfig({
      socialContext: {
        intimacyBand: 'deep',
        contentRating: 'mature_implied',
      },
    });

    const world = createTestWorld({ maxContentRating: 'romantic' });
    const result = validateGenerationNode(config, { world });

    expect(result.errors).toContain(
      "Content rating 'mature_implied' exceeds world maximum 'romantic'"
    );
    expect(isGenerationNodeValid(config, { world })).toBe(false);
  });

  it('should error when social context exceeds user max rating', () => {
    const config = createTestNodeConfig({
      socialContext: {
        intimacyBand: 'light',
        contentRating: 'romantic',
      },
    });

    const userPrefs = { maxContentRating: 'sfw' as const };
    const result = validateGenerationNode(config, { userPrefs });

    expect(result.errors).toContain(
      "Content rating 'romantic' exceeds user maximum 'sfw'"
    );
  });

  it('should error when duration constraints are invalid', () => {
    const config = createTestNodeConfig({
      duration: { min: 30, max: 10 }, // Invalid: min > max
    });

    const result = validateGenerationNode(config);

    expect(result.errors).toContain(
      'Duration min (30s) cannot be greater than max (10s)'
    );
  });

  it('should error when fallback mode requires defaultContentId', () => {
    const config = createTestNodeConfig({
      fallback: { mode: 'default_content' }, // Missing defaultContentId
    });

    const result = validateGenerationNode(config);

    expect(result.errors).toContain(
      'Fallback mode "default_content" requires defaultContentId to be set'
    );
  });

  it('should warn for restricted content rating', () => {
    const config = createTestNodeConfig({
      socialContext: {
        intimacyBand: 'intense',
        contentRating: 'restricted',
      },
    });

    const result = validateGenerationNode(config);

    expect(result.warnings).toContainEqual(
      expect.stringContaining('Content rating is "restricted"')
    );
  });

  it('should suggest social context for NPC response without it', () => {
    const config = createTestNodeConfig({
      generationType: 'npc_response',
      // No socialContext
    });

    const result = validateGenerationNode(config);

    expect(result.suggestions).toContainEqual(
      expect.stringContaining('Consider adding social context')
    );
  });
});

// ============================================================================
// Regression Anchors
// ============================================================================

describe('Regression Anchors', () => {
  /**
   * These tests serve as regression anchors to ensure changes to
   * relationship metrics don't silently change generation context.
   */

  it('Anchor: affinity=75, chemistry=70, trust=55 → intimate/deep/mature_implied', () => {
    const session = createTestSession({
      'npc:12': {
        affinity: 75,
        trust: 55,
        chemistry: 70,
        tension: 15,
        tierId: 'close_friend',
        intimacyLevelId: 'intimate',
      },
    });

    const context = buildGenerationSocialContext(session, undefined, [12]);

    expect(context.intimacyLevelId).toBe('intimate');
    expect(context.intimacyBand).toBe('deep');
    expect(context.contentRating).toBe('mature_implied');
  });

  it('Anchor: World maxRating=romantic clamps mature_implied → romantic', () => {
    const session = createTestSession({
      'npc:12': { intimacyLevelId: 'intimate' },
    });

    const world = createTestWorld({ maxContentRating: 'romantic' });
    const context = buildGenerationSocialContext(session, world, [12]);

    expect(context.contentRating).toBe('romantic'); // Clamped
  });

  it('Anchor: reduceIntensity=true reduces deep → light', () => {
    const session = createTestSession({
      'npc:12': { intimacyLevelId: 'intimate' }, // Normally 'deep'
    });

    const context = buildGenerationSocialContext(session, undefined, [12], {
      reduceIntensity: true,
    });

    expect(context.intimacyBand).toBe('light'); // Reduced from 'deep'
  });
});
