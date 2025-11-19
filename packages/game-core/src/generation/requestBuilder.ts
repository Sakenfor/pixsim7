/**
 * Generation Request Builder
 *
 * Canonical implementation for building GenerateContentRequest from
 * GenerationNodeConfig with social context integration.
 *
 * This module provides the ONLY supported way to assemble generation requests
 * with relationship/intimacy context attached.
 *
 * @authority CLIENT_FALLBACK
 * This is a client-side helper for assembling requests.
 * Backend is authoritative for processing and enforcing constraints.
 *
 * @use_cases Generation node execution, editor previews, test harness
 *
 * @status CANONICAL
 * This is the canonical request builder. All new generation work MUST use
 * this builder to ensure consistent request structure and social context.
 * Direct manual construction of GenerateContentRequest is DEPRECATED.
 * See docs/DYNAMIC_GENERATION_FOUNDATION.md for usage guidelines.
 */

import type {
  GenerationNodeConfig,
  GenerateContentRequest,
  GameSessionDTO,
  GameWorldDetail,
  GenerationSocialContext,
} from '@pixsim7/types';
import { buildGenerationSocialContext } from '../relationships/socialContext';
import type { SocialContextConfig } from '../relationships/socialContext';

/**
 * Options for building generation content requests
 */
export interface BuildRequestOptions {
  /**
   * Game session containing relationship state
   */
  session: GameSessionDTO;

  /**
   * Game world containing generation config
   */
  world?: GameWorldDetail;

  /**
   * NPC IDs relevant to this generation
   * Used to determine relationship context
   */
  npcIds?: number[];

  /**
   * Additional social context configuration
   * Overrides world/session defaults
   */
  socialContextConfig?: SocialContextConfig;

  /**
   * Seed for deterministic generation
   * Derived from strategy + playthrough/player IDs
   */
  seed?: string;

  /**
   * Cache key for this request
   * Used for deduplication and caching
   */
  cacheKey?: string;
}

/**
 * Build GenerateContentRequest from GenerationNodeConfig
 *
 * This is the canonical function for assembling generation requests.
 * It handles:
 * - Mapping node config to request format
 * - Building and attaching social context
 * - Respecting world/user constraints
 * - Deriving player context from session
 *
 * @param config - Generation node configuration
 * @param options - Build options (session, world, NPCs, etc.)
 * @returns Complete GenerateContentRequest ready to send to backend
 *
 * @example
 * ```ts
 * // Build request for NPC response with relationship context
 * const request = buildGenerateContentRequest(generationNode.config, {
 *   session: currentSession,
 *   world: currentWorld,
 *   npcIds: [12], // Alice
 *   seed: 'playthrough-123-node-456',
 *   cacheKey: 'npc_response|gap_fill|scene42|scene43|per_playthrough|xyz|v1'
 * });
 *
 * // Request now has social_context attached based on relationship with Alice
 * console.log(request.social_context?.intimacyLevelId); // 'intimate'
 * console.log(request.social_context?.contentRating); // 'mature_implied'
 * ```
 *
 * @example
 * ```ts
 * // Build request for transition with no relationship context
 * const request = buildGenerateContentRequest(transitionConfig, {
 *   session: currentSession,
 *   world: currentWorld,
 *   // No npcIds = no social context (or default to 'sfw')
 * });
 *
 * console.log(request.social_context?.contentRating); // 'sfw'
 * ```
 */
export function buildGenerateContentRequest(
  config: GenerationNodeConfig,
  options: BuildRequestOptions
): GenerateContentRequest {
  const { session, world, npcIds, socialContextConfig, seed, cacheKey } = options;

  // Build social context from relationship state
  const socialContext: GenerationSocialContext | undefined =
    config.socialContext ||
    buildGenerationSocialContext(session, world, npcIds, socialContextConfig);

  // Derive player context from session
  const playerContext = {
    playthroughId: session.id.toString(),
    playerId: session.user_id.toString(),
    flags: session.flags,
    // Note: relationships are captured separately in social_context
    // to keep player_context focused on choices/flags/stats
  };

  // Assemble request
  const request: GenerateContentRequest = {
    type: config.generationType,
    style: config.style,
    duration: config.duration,
    constraints: config.constraints,
    strategy: config.strategy,
    seed,
    fallback: config.fallback,
    template_id: config.templateId,
    cache_key: cacheKey,
    player_context: playerContext,
    social_context: socialContext,
  };

  // Add NPC params if this is an NPC response generation
  if (config.generationType === 'npc_response' && npcIds && npcIds.length > 0) {
    // NPC params would be populated here from config or session
    // For now, this is a placeholder showing the integration point
    request.npc_params = {
      npc_id: npcIds[0].toString(),
      npc_name: `NPC ${npcIds[0]}`, // Would come from actual NPC data
      expression: 'neutral',
      emotion: 'neutral',
      animation: 'idle',
      intensity: 0.5,
      // Social context influences these params in actual implementation
    };
  }

  return request;
}

/**
 * Build social context only (convenience wrapper)
 *
 * Useful when you need to preview/inspect social context without
 * building a full generation request.
 *
 * @param session - Game session
 * @param world - Game world (optional)
 * @param npcIds - NPC IDs (optional)
 * @param config - Social context config (optional)
 * @returns Generated social context
 *
 * @example
 * ```ts
 * const context = buildSocialContext(session, world, [12]);
 * console.log(context.intimacyBand); // 'deep'
 * ```
 */
export function buildSocialContext(
  session: GameSessionDTO,
  world?: GameWorldDetail,
  npcIds?: number[],
  config?: SocialContextConfig
): GenerationSocialContext {
  return buildGenerationSocialContext(session, world, npcIds, config);
}

/**
 * Compute cache key for generation request
 *
 * Cache key format (from DYNAMIC_GENERATION_FOUNDATION.md):
 * [type]|[purpose]|[fromSceneId]|[toSceneId]|[strategy]|[seed]|[version]
 *
 * For relationship-aware generation, we may want to include intimacy band
 * in the cache key to ensure content is regenerated when relationships change
 * significantly.
 *
 * @param config - Generation node config
 * @param options - Additional options (from/to scenes, seed, etc.)
 * @returns Cache key string
 *
 * @example
 * ```ts
 * const key = computeCacheKey(config, {
 *   fromSceneId: 'scene42',
 *   toSceneId: 'scene43',
 *   seed: 'playthrough-123',
 *   intimacyBand: 'deep'
 * });
 * // 'transition|gap_fill|scene42|scene43|per_playthrough|playthrough-123|deep|v1'
 * ```
 */
export function computeCacheKey(
  config: GenerationNodeConfig,
  options: {
    fromSceneId?: string;
    toSceneId?: string;
    seed?: string;
    intimacyBand?: string;
  }
): string {
  const parts = [
    config.generationType,
    config.purpose,
    options.fromSceneId || '',
    options.toSceneId || '',
    config.strategy,
  ];

  // Only include seed for strategies that use it
  if (config.strategy !== 'once') {
    parts.push(options.seed || '');
  }

  // Include intimacy band if present (for cache invalidation on relationship changes)
  if (options.intimacyBand) {
    parts.push(options.intimacyBand);
  }

  // Include version for cache invalidation
  parts.push(`v${config.version}`);

  return parts.join('|');
}
