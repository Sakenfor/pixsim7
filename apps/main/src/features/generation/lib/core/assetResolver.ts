/**
 * Asset Resolver for ActionBlocks / DSL → Assets (Task 99.2)
 *
 * Given a structured request (from ActionBlocks, prompt DSL, or a higher-level "generate scene" action),
 * resolve appropriate assets based on IDs + roles.
 *
 * This resolver acts as a bridge between:
 * - Prompt DSL / ActionBlocks (character/location references)
 * - NPC/location identity systems
 * - Gallery assets with tags and roles
 */

import type { GalleryAsset } from '../gallery/types';
import type { AssetCharacterId, AssetLocationId, AssetRole } from '@features/gallery/lib/core/assetRoles';
import {
  filterAssetsByRole,
  filterAssetsByCharacter,
  filterAssetsByLocation,
  filterAssetsByRoleAndIdentity,
  hasAssetLocation,
  hasAssetCharacter,
  hasAssetRole,
} from '@features/gallery/lib/core/assetRoles';

/**
 * Asset resolution request
 * Used to describe what assets are needed for an operation
 */
export interface AssetResolutionRequest {
  /** Location ID for the scene (e.g., 'loc:dungeon_entrance') */
  locationId?: AssetLocationId;

  /** Hero/protagonist character ID (e.g., 'npc:alex', 'player') */
  heroId?: AssetCharacterId;

  /** Enemy/antagonist character IDs (e.g., ['npc:boss_01']) */
  enemyIds?: AssetCharacterId[];

  /** Other character IDs (e.g., ['npc:companion']) */
  otherCharacterIds?: AssetCharacterId[];

  /** Desired roles for filtering */
  needBackground?: boolean;
  needHero?: boolean;
  needEnemies?: boolean;
  needOtherCharacters?: boolean;

  /** Additional tags to match (optional) */
  requiredTags?: string[];

  /** Maximum number of results per category */
  maxResults?: number;
}

/**
 * Asset resolution result
 * Contains resolved assets grouped by role
 */
export interface AssetResolutionResult {
  /** Background asset for the location */
  backgroundAsset?: GalleryAsset;

  /** All background candidates (if multiple found) */
  backgroundCandidates: GalleryAsset[];

  /** Hero character assets */
  heroAssets: GalleryAsset[];

  /** Enemy character assets */
  enemyAssets: GalleryAsset[];

  /** Other character assets */
  otherCharacterAssets: GalleryAsset[];

  /** All matched assets (combined) */
  allMatched: GalleryAsset[];

  /** Resolution metadata */
  metadata: {
    /** Whether exact matches were found */
    hasExactLocationMatch: boolean;
    hasExactHeroMatch: boolean;
    hasExactEnemyMatch: boolean;

    /** Whether fallbacks were used */
    usedBackgroundFallback: boolean;
    usedCharacterFallback: boolean;
  };
}

/**
 * Score an asset for relevance to the request
 * Higher score = more relevant
 */
function scoreAssetRelevance(
  asset: GalleryAsset,
  request: AssetResolutionRequest
): number {
  let score = 0;

  // Exact location match is highly valuable
  if (request.locationId && hasAssetLocation(asset, request.locationId)) {
    score += 100;
  }

  // Exact character match is highly valuable
  if (request.heroId && hasAssetCharacter(asset, request.heroId)) {
    score += 100;
  }

  if (request.enemyIds) {
    for (const enemyId of request.enemyIds) {
      if (hasAssetCharacter(asset, enemyId)) {
        score += 100;
      }
    }
  }

  if (request.otherCharacterIds) {
    for (const charId of request.otherCharacterIds) {
      if (hasAssetCharacter(asset, charId)) {
        score += 50;
      }
    }
  }

  // Required tags
  if (request.requiredTags && asset.tags) {
    for (const tag of request.requiredTags) {
      if (asset.tags.includes(tag)) {
        score += 20;
      }
    }
  }

  // Role matches (lower value than identity matches)
  if (request.needBackground && hasAssetRole(asset, 'bg')) {
    score += 10;
  }

  if (request.needHero && (hasAssetRole(asset, 'char:hero') || hasAssetRole(asset, 'pov:player'))) {
    score += 10;
  }

  if (request.needEnemies && hasAssetRole(asset, 'char:monster')) {
    score += 10;
  }

  return score;
}

/**
 * Resolve assets for an action/scene based on a structured request
 *
 * Resolution strategy:
 * 1. Try to find exact matches (location + role, character + role)
 * 2. Fall back to role-only matches if no exact match
 * 3. Return empty slots if no matches found
 *
 * @param request - What assets are needed
 * @param candidates - Available assets to choose from
 * @returns Resolved assets grouped by role
 */
export function resolveAssetsForAction(
  request: AssetResolutionRequest,
  candidates: GalleryAsset[]
): AssetResolutionResult {
  const maxResults = request.maxResults ?? 5;

  // Score and sort all candidates
  const scored = candidates
    .map(asset => ({
      asset,
      score: scoreAssetRelevance(asset, request),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const allMatched = scored.map(item => item.asset);

  // Initialize result
  const result: AssetResolutionResult = {
    backgroundAsset: undefined,
    backgroundCandidates: [],
    heroAssets: [],
    enemyAssets: [],
    otherCharacterAssets: [],
    allMatched,
    metadata: {
      hasExactLocationMatch: false,
      hasExactHeroMatch: false,
      hasExactEnemyMatch: false,
      usedBackgroundFallback: false,
      usedCharacterFallback: false,
    },
  };

  // Resolve background
  if (request.needBackground !== false) {
    // Try exact match: location + bg role
    if (request.locationId) {
      const exactBgMatches = filterAssetsByRoleAndIdentity(candidates, {
        role: 'bg',
        locationId: request.locationId,
      });

      if (exactBgMatches.length > 0) {
        result.backgroundCandidates = exactBgMatches.slice(0, maxResults);
        result.backgroundAsset = exactBgMatches[0];
        result.metadata.hasExactLocationMatch = true;
      }
    }

    // Fallback: any bg role
    if (!result.backgroundAsset) {
      const bgFallbacks = filterAssetsByRole(candidates, 'bg');
      if (bgFallbacks.length > 0) {
        result.backgroundCandidates = bgFallbacks.slice(0, maxResults);
        result.backgroundAsset = bgFallbacks[0];
        result.metadata.usedBackgroundFallback = true;
      }
    }
  }

  // Resolve hero
  if (request.needHero !== false && request.heroId) {
    // Try exact match: heroId + hero/pov role
    const exactHeroMatches = candidates.filter(
      asset =>
        hasAssetCharacter(asset, request.heroId!) &&
        (hasAssetRole(asset, 'char:hero') || hasAssetRole(asset, 'pov:player'))
    );

    if (exactHeroMatches.length > 0) {
      result.heroAssets = exactHeroMatches.slice(0, maxResults);
      result.metadata.hasExactHeroMatch = true;
    } else {
      // Fallback 1: Any asset with heroId
      const heroIdMatches = filterAssetsByCharacter(candidates, request.heroId);
      if (heroIdMatches.length > 0) {
        result.heroAssets = heroIdMatches.slice(0, maxResults);
        result.metadata.usedCharacterFallback = true;
      } else {
        // Fallback 2: Any asset with hero/pov role
        const heroRoleMatches = candidates.filter(
          asset => hasAssetRole(asset, 'char:hero') || hasAssetRole(asset, 'pov:player')
        );
        if (heroRoleMatches.length > 0) {
          result.heroAssets = heroRoleMatches.slice(0, maxResults);
          result.metadata.usedCharacterFallback = true;
        }
      }
    }
  }

  // Resolve enemies
  if (request.needEnemies !== false && request.enemyIds && request.enemyIds.length > 0) {
    const enemyAssets: GalleryAsset[] = [];

    for (const enemyId of request.enemyIds) {
      // Try exact match: enemyId + monster role
      const exactEnemyMatches = candidates.filter(
        asset => hasAssetCharacter(asset, enemyId) && hasAssetRole(asset, 'char:monster')
      );

      if (exactEnemyMatches.length > 0) {
        enemyAssets.push(...exactEnemyMatches.slice(0, maxResults));
        result.metadata.hasExactEnemyMatch = true;
      } else {
        // Fallback: Any asset with enemyId
        const enemyIdMatches = filterAssetsByCharacter(candidates, enemyId);
        if (enemyIdMatches.length > 0) {
          enemyAssets.push(...enemyIdMatches.slice(0, maxResults));
          result.metadata.usedCharacterFallback = true;
        }
      }
    }

    // If no exact matches, fall back to any monster role
    if (enemyAssets.length === 0) {
      const monsterRoleMatches = filterAssetsByRole(candidates, 'char:monster');
      if (monsterRoleMatches.length > 0) {
        enemyAssets.push(...monsterRoleMatches.slice(0, maxResults));
        result.metadata.usedCharacterFallback = true;
      }
    }

    result.enemyAssets = enemyAssets;
  }

  // Resolve other characters
  if (request.otherCharacterIds && request.otherCharacterIds.length > 0) {
    const otherAssets: GalleryAsset[] = [];

    for (const charId of request.otherCharacterIds) {
      const charMatches = filterAssetsByCharacter(candidates, charId);
      if (charMatches.length > 0) {
        otherAssets.push(...charMatches.slice(0, maxResults));
      }
    }

    result.otherCharacterAssets = otherAssets;
  }

  return result;
}

/**
 * Helper: Resolve a single asset for a specific purpose
 * Useful for simple cases where you need one specific asset type
 */
export function resolveSingleAsset(
  candidates: GalleryAsset[],
  options: {
    role?: AssetRole;
    characterId?: AssetCharacterId;
    locationId?: AssetLocationId;
    requiredTags?: string[];
  }
): GalleryAsset | undefined {
  // Try exact match first
  const exactMatches = filterAssetsByRoleAndIdentity(candidates, options);
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  // Try role-only match
  if (options.role) {
    const roleMatches = filterAssetsByRole(candidates, options.role);
    if (roleMatches.length > 0) {
      return roleMatches[0];
    }
  }

  // Try character-only match
  if (options.characterId) {
    const charMatches = filterAssetsByCharacter(candidates, options.characterId);
    if (charMatches.length > 0) {
      return charMatches[0];
    }
  }

  // Try location-only match
  if (options.locationId) {
    const locMatches = filterAssetsByLocation(candidates, options.locationId);
    if (locMatches.length > 0) {
      return locMatches[0];
    }
  }

  return undefined;
}

/**
 * Helper: Create a resolution request from ActionBlock-like data
 * This bridges ActionBlock metadata to the resolver's request format
 */
export function createRequestFromActionBlock(actionBlock: {
  tags?: string[];
  metadata?: Record<string, any>;
}): AssetResolutionRequest {
  const request: AssetResolutionRequest = {
    maxResults: 5,
  };

  if (!actionBlock.tags) {
    return request;
  }

  // Extract IDs from tags
  for (const tag of actionBlock.tags) {
    if (tag.startsWith('loc:')) {
      request.locationId = tag;
    } else if (tag.startsWith('npc:') || tag === 'player') {
      // Assume first character tag is hero
      if (!request.heroId) {
        request.heroId = tag;
      } else {
        // Additional characters go to enemies or other
        if (!request.enemyIds) {
          request.enemyIds = [];
        }
        request.enemyIds.push(tag);
      }
    }
  }

  // Infer what's needed based on what IDs we found
  request.needBackground = !!request.locationId;
  request.needHero = !!request.heroId;
  request.needEnemies = !!request.enemyIds && request.enemyIds.length > 0;

  return request;
}
