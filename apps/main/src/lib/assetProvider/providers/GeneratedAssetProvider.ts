/**
 * Generated Asset Provider
 *
 * Wraps the /api/v1/generations API with polling for completion.
 * Handles generation requests, status polling, and asset creation.
 */

import { pollUntil } from '@pixsim7/shared.async.core';
import type {
  Asset,
  AssetRequest,
  AssetAvailability,
  IAssetProvider,
} from '@pixsim7/shared.types';
import {
  AssetNotFoundError,
  AssetGenerationError,
  AssetTimeoutError,
} from '@pixsim7/shared.types';

import {
  createGeneration,
  getGeneration,
  type GenerationResponse,
  type CreateGenerationRequest,
} from '@lib/api/generations';

import { getAsset as getAssetApi } from '@features/assets/lib/api';

// ============================================================================
// Types
// ============================================================================

export interface GeneratedAssetProviderConfig {
  /** Default provider ID for generation (default: 'pixverse') */
  defaultProvider: string;
  /** Default max wait time for generation in ms (default: 120000) */
  defaultMaxWaitTime: number;
  /** Base polling interval in ms (default: 3000) */
  pollIntervalMs: number;
  /** Max polling interval in ms (default: 30000) */
  pollMaxIntervalMs: number;
}

const DEFAULT_CONFIG: GeneratedAssetProviderConfig = {
  defaultProvider: 'pixverse',
  defaultMaxWaitTime: 120000,
  pollIntervalMs: 3000,
  pollMaxIntervalMs: 30000,
};

// ============================================================================
// Helper Functions
// ============================================================================

function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

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

function buildGenerationConfig(request: AssetRequest): CreateGenerationRequest['config'] {
  const config: CreateGenerationRequest['config'] = {
    generationType: 'transition',
    purpose: 'gap_fill',
    strategy: request.strategy ?? 'per_playthrough',
    enabled: true,
    version: 1,
    style: {
      pacing: 'medium',
    },
    duration: {
      target: request.duration ?? 5,
    },
    constraints: {
      rating: 'PG-13',
    },
    fallback: {
      mode: 'skip',
    },
    ...(request.prompt ? { prompt: request.prompt } : {}),
    ...(request.imageUrl ? { image_url: request.imageUrl } : {}),
    ...(request.videoUrl ? { video_url: request.videoUrl } : {}),
    ...(request.providerParams ? request.providerParams : {}),
  };

  return config;
}

// ============================================================================
// GeneratedAssetProvider
// ============================================================================

/**
 * Asset provider that generates assets via the backend generation API.
 *
 * Handles:
 * - Building generation requests from AssetRequest
 * - Submitting to /api/v1/generations
 * - Polling for completion
 * - Mapping results to Asset interface
 */
export class GeneratedAssetProvider implements IAssetProvider {
  private config: GeneratedAssetProviderConfig;

  constructor(config: Partial<GeneratedAssetProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get an asset by ID
   *
   * Fetches from the assets API (not generation-specific).
   */
  async getAsset(assetId: string): Promise<Asset> {
    try {
      const response = await getAssetApi(parseInt(assetId, 10));

      return {
        id: String(response.id),
        url: response.remote_url ?? response.file_url ?? '',
        type: mapMediaType(response.media_type),
        source: 'generated',
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
   * Request asset generation
   *
   * Creates a generation job and polls until completion.
   */
  async requestAsset(request: AssetRequest): Promise<Asset> {
    const maxWaitTime = request.maxWaitTime ?? this.config.defaultMaxWaitTime;
    const providerId = request.providerId ?? this.config.defaultProvider;

    // Build generation request
    const generationRequest: CreateGenerationRequest = {
      config: buildGenerationConfig(request) as unknown as CreateGenerationRequest['config'],
      provider_id: providerId,
      force_new: request.preferCached === false,
      priority: 5,
      version_intent: 'new',
      ...(request.sceneId
        ? {
          from_scene: {
            id: request.sceneId,
            location: request.locationId,
          },
        }
        : {}),
    };

    // Submit generation
    let generation: GenerationResponse;
    try {
      generation = await createGeneration(generationRequest);
    } catch (error) {
      throw new AssetGenerationError(
        request,
        error instanceof Error ? error : undefined,
        'Failed to submit generation request'
      );
    }

    // If already completed (cache hit), return immediately
    if (generation.status === 'completed' && generation.asset?.id) {
      return this.getAsset(String(generation.asset.id));
    }

    // If already failed, throw immediately
    if (generation.status === 'failed') {
      throw new AssetGenerationError(
        request,
        undefined,
        generation.error_message ?? 'Generation failed'
      );
    }

    // Poll for completion
    return this.pollForCompletion(generation.id, request, maxWaitTime);
  }

  /**
   * Check if generation is available (always returns not available since we generate on-demand)
   */
  async checkAvailability(request: AssetRequest): Promise<AssetAvailability> {
    void request;
    // GeneratedAssetProvider doesn't have pre-existing assets
    // It always generates on-demand
    return {
      available: false,
      estimatedGenerationTimeMs: 30000, // Rough estimate
    };
  }

  /**
   * Poll for generation completion
   */
  private pollForCompletion(
    generationId: number,
    request: AssetRequest,
    maxWaitTime: number
  ): Promise<Asset> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let resolved = false;

      const cancel = pollUntil(
        () => getGeneration(generationId),
        (data) => isTerminalStatus(data.status),
        {
          base: this.config.pollIntervalMs,
          max: this.config.pollMaxIntervalMs,
          backoffStartMs: 60000,
          onFetch: async (data: GenerationResponse) => {
            if (resolved) return;

            // Check timeout
            if (Date.now() - startTime > maxWaitTime) {
              resolved = true;
              cancel();
              reject(new AssetTimeoutError(request, maxWaitTime));
              return;
            }

            // Check for completion
            if (data.status === 'completed' && data.asset?.id) {
              resolved = true;
              cancel();
              try {
                const asset = await this.getAsset(String(data.asset.id));
                resolve({
                  ...asset,
                  metadata: {
                    ...asset.metadata,
                    generationId: data.id,
                  },
                });
              } catch (error) {
                reject(
                  new AssetGenerationError(
                    request,
                    error instanceof Error ? error : undefined,
                    'Failed to fetch generated asset'
                  )
                );
              }
            }

            // Check for failure
            if (data.status === 'failed' || data.status === 'cancelled') {
              resolved = true;
              cancel();
              reject(
                new AssetGenerationError(
                  request,
                  undefined,
                  data.error_message ?? `Generation ${data.status}`
                )
              );
            }
          },
          onError: (error: unknown) => {
            // Don't reject on poll errors, let polling continue
            console.warn('[GeneratedAssetProvider] Poll error:', error);
          },
        }
      );

      // Set up timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cancel();
          reject(new AssetTimeoutError(request, maxWaitTime));
        }
      }, maxWaitTime);
    });
  }
}
