/**
 * Pre-Made Asset Provider
 *
 * Wraps the /api/v1/assets API for querying existing (non-generated) assets.
 * Supports tag-based filtering for scene/character/location matching.
 */

import type {
  Asset,
  AssetRequest,
  AssetAvailability,
  IAssetProvider,
} from '@pixsim7/shared.types';
import { AssetNotFoundError } from '@pixsim7/shared.types';

import { getAsset as getAssetApi, listAssets } from '@features/assets/lib/api';
import type { AssetResponse } from '@features/assets/lib/api';

// ============================================================================
// Types
// ============================================================================

export interface PreMadeAssetProviderConfig {
  /** Maximum assets to fetch per query (default: 50) */
  queryLimit: number;
}

const DEFAULT_CONFIG: PreMadeAssetProviderConfig = {
  queryLimit: 50,
};

// ============================================================================
// Helper Functions
// ============================================================================

function mapMediaType(mediaType: string): 'video' | 'image' | 'audio' | '3d_model' {
  switch (mediaType) {
    case 'video':
      return 'video';
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case '3d_model':
      return '3d_model';
    default:
      return 'video';
  }
}

function mapAssetResponseToAsset(summary: AssetResponse): Asset {
  const tags = summary.tags?.map((tag) => tag.slug || tag.name || tag.display_name || '') ?? undefined;
  return {
    id: String(summary.id),
    url: summary.remote_url || summary.file_url || '',
    type: mapMediaType(summary.media_type),
    source: 'pre-made',
    metadata: {
      description: summary.description || undefined,
      tags,
      durationSec: summary.duration_sec || undefined,
      width: summary.width || undefined,
      height: summary.height || undefined,
      thumbnailUrl: summary.thumbnail_url || undefined,
    },
  };
}

/**
 * Build tag query from asset request context
 *
 * Uses the tag conventions from assetRoles.ts:
 * - loc:* for locations
 * - npc:* for characters
 * - scene:* for scenes (if tagged)
 */
function buildTagFromRequest(request: AssetRequest): string | undefined {
  // Priority: locationId > sceneId > characterId
  if (request.locationId) {
    // Location tags use 'loc:' prefix
    return request.locationId.startsWith('loc:')
      ? request.locationId
      : `loc:${request.locationId}`;
  }

  if (request.sceneId) {
    // Scene tags might use 'scene:' or direct scene ID
    return request.sceneId.startsWith('scene:')
      ? request.sceneId
      : `scene:${request.sceneId}`;
  }

  if (request.characterId) {
    // Character tags use 'npc:' prefix (or 'player')
    if (request.characterId === 'player') {
      return 'player';
    }
    return request.characterId.startsWith('npc:')
      ? request.characterId
      : `npc:${request.characterId}`;
  }

  return undefined;
}

/**
 * Score an asset based on how well it matches the request
 *
 * Higher scores = better match
 */
function scoreAsset(asset: AssetResponse, request: AssetRequest): number {
  let score = 0;
  const tags = asset.tags?.map((tag) => tag.slug || tag.name || tag.display_name || '') ?? [];

  // Location match (high value)
  if (request.locationId) {
    const locationTag = request.locationId.startsWith('loc:')
      ? request.locationId
      : `loc:${request.locationId}`;
    if (tags.includes(locationTag)) {
      score += 100;
    }
  }

  // Character match (high value)
  if (request.characterId) {
    const characterTag =
      request.characterId === 'player'
        ? 'player'
        : request.characterId.startsWith('npc:')
          ? request.characterId
          : `npc:${request.characterId}`;
    if (tags.includes(characterTag)) {
      score += 100;
    }
  }

  // Scene match (medium value)
  if (request.sceneId) {
    const sceneTag = request.sceneId.startsWith('scene:')
      ? request.sceneId
      : `scene:${request.sceneId}`;
    if (tags.includes(sceneTag)) {
      score += 50;
    }
  }

  // Choice match (medium value)
  if (request.choiceId) {
    const choiceTag = `choice:${request.choiceId}`;
    if (tags.includes(choiceTag)) {
      score += 50;
    }
  }

  return score;
}

// ============================================================================
// PreMadeAssetProvider
// ============================================================================

/**
 * Asset provider for pre-made/uploaded assets.
 *
 * Queries the backend asset database with tag-based filtering.
 * Uses scoring to find the best match when multiple assets are available.
 */
export class PreMadeAssetProvider implements IAssetProvider {
  private config: PreMadeAssetProviderConfig;

  constructor(config: Partial<PreMadeAssetProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get an asset by ID
   */
  async getAsset(assetId: string): Promise<Asset> {
    try {
      const response = await getAssetApi(parseInt(assetId, 10));

      return {
        id: String(response.id),
        url: response.remote_url ?? response.file_url ?? '',
        type: mapMediaType(response.media_type),
        source: 'pre-made',
        metadata: {
          thumbnailUrl: response.thumbnail_url ?? undefined,
          mimeType: response.mime_type ?? undefined,
        },
      };
    } catch (error) {
      void error;
      throw new AssetNotFoundError(assetId);
    }
  }

  /**
   * Request an asset matching the given requirements
   *
   * Searches existing assets using tag filters, then scores matches.
   * Returns the best matching asset or throws if none found.
   */
  async requestAsset(request: AssetRequest): Promise<Asset> {
    const matchingAsset = await this.findMatchingAsset(request);

    if (!matchingAsset) {
      throw new AssetNotFoundError(
        `No pre-made asset found for request: ${JSON.stringify({
          sceneId: request.sceneId,
          choiceId: request.choiceId,
          characterId: request.characterId,
          locationId: request.locationId,
        })}`
      );
    }

    return matchingAsset;
  }

  /**
   * Check if a pre-made asset is available
   */
  async checkAvailability(request: AssetRequest): Promise<AssetAvailability> {
    const asset = await this.findMatchingAsset(request);

    if (asset) {
      return {
        available: true,
        source: 'pre-made',
        assetId: asset.id,
      };
    }

    return {
      available: false,
    };
  }

  /**
   * Find the best matching asset for a request
   *
   * Returns null if no suitable asset is found.
   */
  async findMatchingAsset(request: AssetRequest): Promise<Asset | null> {
    // Build query parameters
    const tag = buildTagFromRequest(request);

    try {
      const response = await listAssets({
        limit: this.config.queryLimit,
        tag: tag || undefined,
        q: request.prompt ? request.prompt.slice(0, 100) : undefined,
      });

      const assets = response.assets;

      if (assets.length === 0) {
        return null;
      }

      // Score all assets and return the best match
      const scored = assets.map((asset) => ({
        asset,
        score: scoreAsset(asset, request),
      }));

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // Return the best match (must have some score)
      const best = scored[0];
      if (best.score > 0) {
        return mapAssetResponseToAsset(best.asset);
      }

      // If no scored matches, return the first asset if we had a tag match
      if (tag) {
        return mapAssetResponseToAsset(assets[0]);
      }

      return null;
    } catch (error) {
      console.warn('[PreMadeAssetProvider] Failed to search assets:', error);
      return null;
    }
  }
}
