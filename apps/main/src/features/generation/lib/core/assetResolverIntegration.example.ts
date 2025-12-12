/**
 * Asset Resolver Integration Examples (Task 99.3)
 *
 * This file demonstrates how to integrate the asset resolver into various flows.
 * These are example patterns to follow when implementing:
 * - Smart MediaCard generate button
 * - ActionBlock i2i/Fusion flows
 * - Control Center preset population
 *
 * NOTE: This is an EXAMPLE file. Actual integration depends on component implementation.
 */

import type { GalleryAsset } from '../gallery/types';
import {
  resolveAssetsForAction,
  resolveSingleAsset,
  createRequestFromActionBlock,
  type AssetResolutionRequest,
  type AssetResolutionResult,
} from './assetResolver';

// ============================================================================
// Example 1: Smart MediaCard Generate Button
// ============================================================================

/**
 * Example: Get compatible assets for generating from a selected asset
 * Use case: When user clicks "Generate" on an asset in the gallery
 */
export function exampleGetCompatibleAssetsForGeneration(
  selectedAsset: GalleryAsset,
  allAssets: GalleryAsset[]
): AssetResolutionResult {
  // Extract identities from the selected asset
  const locationId = selectedAsset.tags?.find(t => t.startsWith('loc:'));
  const characterId = selectedAsset.tags?.find(t => t.startsWith('npc:') || t === 'player');

  // Build resolution request based on the asset's context
  const request: AssetResolutionRequest = {
    locationId,
    heroId: characterId,
    needBackground: true,
    needHero: true,
    maxResults: 5,
  };

  // Resolve compatible assets
  return resolveAssetsForAction(request, allAssets);
}

/**
 * Example: Suggest related assets for Fusion operation
 * Use case: User wants to create a fusion with character + background
 */
export function exampleSuggestFusionAssets(
  locationId: string,
  characterId: string,
  allAssets: GalleryAsset[]
): {
  background?: GalleryAsset;
  character?: GalleryAsset;
} {
  const result = resolveAssetsForAction(
    {
      locationId,
      heroId: characterId,
      needBackground: true,
      needHero: true,
      maxResults: 1,
    },
    allAssets
  );

  return {
    background: result.backgroundAsset,
    character: result.heroAssets[0],
  };
}

// ============================================================================
// Example 2: ActionBlock i2i/Fusion Integration
// ============================================================================

/**
 * Example: Resolve assets for an ActionBlock execution
 * Use case: When executing an ActionBlock that references characters/locations
 */
export function exampleResolveAssetsForActionBlock(
  actionBlock: {
    id: string;
    tags?: string[];
    metadata?: Record<string, any>;
  },
  availableAssets: GalleryAsset[]
): AssetResolutionResult {
  // Use the helper to convert ActionBlock tags to resolution request
  const request = createRequestFromActionBlock(actionBlock);

  // Resolve assets
  return resolveAssetsForAction(request, availableAssets);
}

/**
 * Example: Populate image_to_image operation with resolved assets
 * Use case: ActionBlock specifies "use character X at location Y"
 */
export function examplePopulateI2IOperation(
  actionBlock: {
    tags?: string[];
    prompt: string;
  },
  availableAssets: GalleryAsset[]
): {
  operation: 'image_to_image';
  image_url?: string;
  prompt: string;
  metadata: {
    resolvedFrom: string[];
    hadExactMatch: boolean;
  };
} {
  const result = exampleResolveAssetsForActionBlock(actionBlock, availableAssets);

  // Pick the best background asset as the base image
  const baseAsset = result.backgroundAsset || result.heroAssets[0];

  return {
    operation: 'image_to_image',
    image_url: baseAsset?.remote_url || baseAsset?.thumbnail_url,
    prompt: actionBlock.prompt,
    metadata: {
      resolvedFrom: [
        result.metadata.hasExactLocationMatch ? 'exact-location' : 'fallback-location',
        result.metadata.hasExactHeroMatch ? 'exact-hero' : 'fallback-hero',
      ],
      hadExactMatch:
        result.metadata.hasExactLocationMatch || result.metadata.hasExactHeroMatch,
    },
  };
}

/**
 * Example: Populate Fusion operation with character + background
 * Use case: ActionBlock or manual fusion needs matching assets
 */
export function examplePopulateFusionOperation(
  request: {
    locationId?: string;
    characterId?: string;
    tags?: string[];
  },
  availableAssets: GalleryAsset[]
): {
  operation: 'fusion';
  fusion_assets: string[];
  assetTypes: Array<'character' | 'background'>;
  metadata: {
    backgroundMatch: 'exact' | 'fallback' | 'none';
    characterMatch: 'exact' | 'fallback' | 'none';
  };
} {
  const result = resolveAssetsForAction(
    {
      locationId: request.locationId,
      heroId: request.characterId,
      needBackground: true,
      needHero: true,
      requiredTags: request.tags,
    },
    availableAssets
  );

  const fusionAssets: string[] = [];
  const assetTypes: Array<'character' | 'background'> = [];

  // Add background asset
  if (result.backgroundAsset) {
    fusionAssets.push(result.backgroundAsset.remote_url || result.backgroundAsset.thumbnail_url!);
    assetTypes.push('background');
  }

  // Add character asset
  if (result.heroAssets[0]) {
    fusionAssets.push(result.heroAssets[0].remote_url || result.heroAssets[0].thumbnail_url!);
    assetTypes.push('character');
  }

  return {
    operation: 'fusion',
    fusion_assets: fusionAssets,
    assetTypes,
    metadata: {
      backgroundMatch: result.metadata.hasExactLocationMatch
        ? 'exact'
        : result.backgroundAsset
          ? 'fallback'
          : 'none',
      characterMatch: result.metadata.hasExactHeroMatch
        ? 'exact'
        : result.heroAssets[0]
          ? 'fallback'
          : 'none',
    },
  };
}

// ============================================================================
// Example 3: Control Center Preset Population
// ============================================================================

/**
 * Example: "Populate from scene" button in Control Center
 * Use case: User is viewing a scene and wants to populate preset with scene assets
 */
export function examplePopulatePresetFromScene(
  sceneContext: {
    locationId?: string;
    characterIds?: string[];
    currentAssets?: GalleryAsset[];
  },
  galleryAssets: GalleryAsset[]
): {
  background?: GalleryAsset;
  characters: GalleryAsset[];
  suggestions: string[];
} {
  const result = resolveAssetsForAction(
    {
      locationId: sceneContext.locationId,
      heroId: sceneContext.characterIds?.[0],
      enemyIds: sceneContext.characterIds?.slice(1),
      needBackground: true,
      needHero: true,
      needEnemies: true,
    },
    galleryAssets
  );

  const suggestions: string[] = [];

  if (result.metadata.hasExactLocationMatch) {
    suggestions.push(`Found exact background for ${sceneContext.locationId}`);
  } else if (result.backgroundAsset) {
    suggestions.push('Using generic background (no exact location match)');
  }

  if (result.metadata.hasExactHeroMatch) {
    suggestions.push(`Found exact character match for ${sceneContext.characterIds?.[0]}`);
  }

  return {
    background: result.backgroundAsset,
    characters: [...result.heroAssets, ...result.enemyAssets],
    suggestions,
  };
}

/**
 * Example: Quick asset picker with role filter
 * Use case: User needs to pick a background asset quickly
 */
export function exampleQuickPickAssetByRole(
  role: 'bg' | 'char:hero' | 'char:monster',
  locationId: string | undefined,
  availableAssets: GalleryAsset[]
): GalleryAsset | undefined {
  return resolveSingleAsset(availableAssets, {
    role,
    locationId,
  });
}

// ============================================================================
// Example 4: Smart Suggestions
// ============================================================================

/**
 * Example: Generate smart suggestions based on asset context
 * Use case: Show "related assets" or "suggested combinations" in UI
 */
export function exampleGenerateSmartSuggestions(
  currentAsset: GalleryAsset,
  allAssets: GalleryAsset[]
): {
  label: string;
  icon: string;
  assets: GalleryAsset[];
  reasoning: string;
}[] {
  const suggestions = [];

  // Extract context
  const locationId = currentAsset.tags?.find(t => t.startsWith('loc:'));
  const characterId = currentAsset.tags?.find(t => t.startsWith('npc:') || t === 'player');

  // Suggestion 1: Related backgrounds
  if (locationId) {
    const backgrounds = resolveAssetsForAction(
      { locationId, needBackground: true },
      allAssets
    );

    if (backgrounds.backgroundCandidates.length > 1) {
      suggestions.push({
        label: 'Other backgrounds at this location',
        icon: '🏞️',
        assets: backgrounds.backgroundCandidates.filter(a => a.id !== currentAsset.id),
        reasoning: `Found ${backgrounds.backgroundCandidates.length} backgrounds for ${locationId}`,
      });
    }
  }

  // Suggestion 2: Same character, different location
  if (characterId) {
    const characterAssets = resolveAssetsForAction(
      { heroId: characterId, needHero: true },
      allAssets
    );

    if (characterAssets.heroAssets.length > 1) {
      suggestions.push({
        label: 'Same character, different scenes',
        icon: '👤',
        assets: characterAssets.heroAssets.filter(a => a.id !== currentAsset.id),
        reasoning: `Found ${characterAssets.heroAssets.length} assets featuring ${characterId}`,
      });
    }
  }

  // Suggestion 3: Combine current character + different backgrounds
  if (characterId && !locationId) {
    const backgrounds = resolveAssetsForAction(
      { needBackground: true, maxResults: 3 },
      allAssets
    );

    suggestions.push({
      label: 'Suggested backgrounds for this character',
      icon: '🎬',
      assets: backgrounds.backgroundCandidates,
      reasoning: 'These backgrounds could work well with this character',
    });
  }

  return suggestions;
}

// ============================================================================
// Example 5: Validation and Quality Checks
// ============================================================================

/**
 * Example: Validate that required assets are available before generation
 * Use case: Pre-flight check before starting a generation operation
 */
export function exampleValidateAssetsAvailable(
  operationParams: {
    locationId?: string;
    characterIds?: string[];
    needsBackground: boolean;
    needsCharacters: boolean;
  },
  availableAssets: GalleryAsset[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const result = resolveAssetsForAction(
    {
      locationId: operationParams.locationId,
      heroId: operationParams.characterIds?.[0],
      enemyIds: operationParams.characterIds?.slice(1),
      needBackground: operationParams.needsBackground,
      needHero: operationParams.needsCharacters,
      needEnemies: (operationParams.characterIds?.length ?? 0) > 1,
    },
    availableAssets
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required assets
  if (operationParams.needsBackground && !result.backgroundAsset) {
    errors.push(`No background asset found for location: ${operationParams.locationId || 'any'}`);
  }

  if (operationParams.needsCharacters && result.heroAssets.length === 0) {
    errors.push(
      `No character assets found for: ${operationParams.characterIds?.join(', ') || 'any'}`
    );
  }

  // Check for fallback usage
  if (result.metadata.usedBackgroundFallback) {
    warnings.push(
      `Using generic background (no exact match for ${operationParams.locationId})`
    );
  }

  if (result.metadata.usedCharacterFallback) {
    warnings.push('Using generic character assets (no exact character ID match)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
