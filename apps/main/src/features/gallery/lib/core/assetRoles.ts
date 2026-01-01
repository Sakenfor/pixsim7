/**
 * Asset Role Helpers (Task 99.1)
 *
 * Utilities for interpreting GalleryAsset.tags as roles and IDs.
 * Provides a centralized place for tag-based role/identity parsing.
 *
 * Design principles:
 * - Use existing ontology IDs where they exist (from ontology.yaml)
 * - Prefer world/NPC IDs (npc:*, loc:*) over ad-hoc vocabularies
 * - No schema changes - everything is tag-based
 *
 * Composition roles:
 * - AssetRole (local) = visual overlay/filtering roles (bg, char:hero, etc.)
 * - ImageCompositionRole (canonical) = composition semantics (main_character, environment, etc.)
 * - inferCompositionRoleFromAsset() bridges the two systems
 */

import type { GalleryAsset } from './types';
import { useCompositionPackageStore } from '@/stores/compositionPackageStore';

/**
 * Character identity tags (from world/NPC systems)
 * Examples: 'npc:alex', 'npc:boss_01', 'player'
 */
export type AssetCharacterId = string;

/**
 * Location identity tags (from world/location systems)
 * Examples: 'loc:dungeon_entrance', 'loc:school_rooftop'
 */
export type AssetLocationId = string;

/**
 * Visual roles for assets
 * These are local overlay/HUD-specific but still consistent
 */
export type AssetRole =
  | 'bg'              // Background
  | 'pov:player'      // Player POV hands/body
  | 'char:hero'       // Hero character
  | 'char:npc'        // NPC character
  | 'char:monster'    // Monster/enemy character
  | 'comic_frame';    // Composite frame usable as a comic panel

function getAssetTagValues(asset: GalleryAsset): string[] {
  if (!asset.tags) return [];
  return asset.tags
    .map((tag: any) => {
      if (typeof tag === 'string') return tag;
      return tag?.slug || tag?.name || '';
    })
    .filter((tag: string) => tag.length > 0);
}

/**
 * Extract asset roles from tags
 * Looks for tags starting with 'role:' and returns the role portion
 */
export function getAssetRoles(asset: GalleryAsset): AssetRole[] {
  const roles: AssetRole[] = [];
  const validRoles: AssetRole[] = [
    'bg',
    'pov:player',
    'char:hero',
    'char:npc',
    'char:monster',
    'comic_frame',
  ];

  for (const tag of getAssetTagValues(asset)) {
    // Handle both 'role:bg' and 'bg' formats
    const roleTag = tag.startsWith('role:') ? tag.slice(5) : tag;

    if (validRoles.includes(roleTag as AssetRole)) {
      roles.push(roleTag as AssetRole);
    }
  }

  return roles;
}

/**
 * Extract character IDs from tags
 * Looks for tags starting with 'npc:' or the special 'player' tag
 */
export function getAssetCharacters(asset: GalleryAsset): AssetCharacterId[] {
  const characters: AssetCharacterId[] = [];

  for (const tag of getAssetTagValues(asset)) {
    if (tag.startsWith('npc:') || tag === 'player') {
      characters.push(tag);
    }
  }

  return characters;
}

/**
 * Extract location IDs from tags
 * Looks for tags starting with 'loc:'
 */
export function getAssetLocations(asset: GalleryAsset): AssetLocationId[] {
  const locations: AssetLocationId[] = [];

  for (const tag of getAssetTagValues(asset)) {
    if (tag.startsWith('loc:')) {
      locations.push(tag);
    }
  }

  return locations;
}

/**
 * Check if an asset has a specific role
 */
export function hasAssetRole(asset: GalleryAsset, role: AssetRole): boolean {
  return getAssetRoles(asset).includes(role);
}

/**
 * Check if an asset is associated with a specific character
 */
export function hasAssetCharacter(asset: GalleryAsset, characterId: AssetCharacterId): boolean {
  return getAssetCharacters(asset).includes(characterId);
}

/**
 * Check if an asset is associated with a specific location
 */
export function hasAssetLocation(asset: GalleryAsset, locationId: AssetLocationId): boolean {
  return getAssetLocations(asset).includes(locationId);
}

/**
 * Extract ontology-aligned camera/POV tags from asset
 * These come from ontology.yaml (e.g., 'cam:pov', 'cam:from_behind')
 */
export function getAssetCameraTags(asset: GalleryAsset): string[] {
  return getAssetTagValues(asset).filter(tag => tag.startsWith('cam:') || tag.startsWith('camera:'));
}

/**
 * Get all identity tags (characters + locations) from an asset
 */
export function getAssetIdentities(asset: GalleryAsset): {
  characters: AssetCharacterId[];
  locations: AssetLocationId[];
} {
  return {
    characters: getAssetCharacters(asset),
    locations: getAssetLocations(asset),
  };
}

/**
 * Filter assets by role
 */
export function filterAssetsByRole(assets: GalleryAsset[], role: AssetRole): GalleryAsset[] {
  return assets.filter(asset => hasAssetRole(asset, role));
}

/**
 * Filter assets by character ID
 */
export function filterAssetsByCharacter(
  assets: GalleryAsset[],
  characterId: AssetCharacterId
): GalleryAsset[] {
  return assets.filter(asset => hasAssetCharacter(asset, characterId));
}

/**
 * Filter assets by location ID
 */
export function filterAssetsByLocation(
  assets: GalleryAsset[],
  locationId: AssetLocationId
): GalleryAsset[] {
  return assets.filter(asset => hasAssetLocation(asset, locationId));
}

/**
 * Filter assets by multiple criteria (AND logic)
 */
export function filterAssetsByRoleAndIdentity(
  assets: GalleryAsset[],
  options: {
    role?: AssetRole;
    characterId?: AssetCharacterId;
    locationId?: AssetLocationId;
  }
): GalleryAsset[] {
  return assets.filter(asset => {
    if (options.role && !hasAssetRole(asset, options.role)) {
      return false;
    }
    if (options.characterId && !hasAssetCharacter(asset, options.characterId)) {
      return false;
    }
    if (options.locationId && !hasAssetLocation(asset, options.locationId)) {
      return false;
    }
    return true;
  });
}

// ============================================================================
// Canonical Composition Role Inference
// ============================================================================

/**
 * Infer canonical composition role from asset tags.
 *
 * Uses runtime API data from compositionPackageStore.
 * Strategy:
 * 1. Check exact slug match (e.g., "bg", "char:hero")
 * 2. Extract namespace prefix (e.g., "npc:alex" -> "npc") and check namespace mapping
 * 3. Return highest-priority role if multiple matches
 *
 * @param asset - GalleryAsset with tags
 * @returns Canonical composition role ID or undefined
 */
export function inferCompositionRoleFromAsset(asset: GalleryAsset): string | undefined {
  const tags = getAssetTagValues(asset);
  return useCompositionPackageStore.getState().inferRoleFromTags(tags);
}
