/**
 * Asset Service (Facade)
 *
 * Main facade for asset provisioning.
 * Coordinates between pre-made and generated assets based on request strategy.
 *
 * Resolution order:
 * 1. Check pre-made assets (if available and matching)
 * 2. Generate new asset (if allowed and no pre-made match)
 * 3. Return placeholder (if generation disabled/failed)
 */

import type {
  Asset,
  AssetRequest,
  AssetAvailability,
  IAssetProvider,
  AssetServiceConfig,
} from '@pixsim7/shared.types';
import {
  DEFAULT_ASSET_SERVICE_CONFIG,
  AssetNotFoundError,
} from '@pixsim7/shared.types';
import { PreMadeAssetProvider } from './providers/PreMadeAssetProvider';
import { GeneratedAssetProvider } from './providers/GeneratedAssetProvider';

// ============================================================================
// Placeholder Asset
// ============================================================================

const PLACEHOLDER_ASSET: Asset = {
  id: 'placeholder',
  url: '',
  type: 'video',
  source: 'pre-made',
  metadata: {
    description: 'Placeholder asset - no content available',
  },
};

// ============================================================================
// AssetService
// ============================================================================

/**
 * Main asset service facade
 *
 * Implements IAssetProvider by coordinating multiple provider implementations.
 * Game code should use this service via AssetProviderContext.
 */
export class AssetService implements IAssetProvider {
  private preMadeProvider: PreMadeAssetProvider;
  private generatedProvider: GeneratedAssetProvider;
  private config: AssetServiceConfig;

  constructor(
    config: Partial<AssetServiceConfig> = {},
    preMadeProvider?: PreMadeAssetProvider,
    generatedProvider?: GeneratedAssetProvider
  ) {
    this.config = { ...DEFAULT_ASSET_SERVICE_CONFIG, ...config };

    // Use provided providers or create defaults
    this.preMadeProvider =
      preMadeProvider ??
      new PreMadeAssetProvider();

    this.generatedProvider =
      generatedProvider ??
      new GeneratedAssetProvider({
        defaultProvider: this.config.defaultProvider,
        defaultMaxWaitTime: this.config.defaultMaxWaitTime,
      });
  }

  /**
   * Get an asset by ID
   *
   * Tries pre-made provider first, then generated provider.
   */
  async getAsset(assetId: string): Promise<Asset> {
    // Try pre-made first
    try {
      return await this.preMadeProvider.getAsset(assetId);
    } catch (error) {
      // Pre-made not found, try generated
    }

    // Try generated provider
    try {
      return await this.generatedProvider.getAsset(assetId);
    } catch (error) {
      // Not found in either provider
    }

    throw new AssetNotFoundError(assetId);
  }

  /**
   * Request an asset matching the given requirements
   *
   * Resolution order:
   * 1. Check pre-made assets (unless preferCached=false)
   * 2. Generate new asset (if allowed and configured)
   * 3. Return placeholder (if all else fails)
   */
  async requestAsset(request: AssetRequest): Promise<Asset> {
    const effectiveRequest = this.applyDefaults(request);

    // Step 1: Check pre-made assets
    if (effectiveRequest.preferCached !== false) {
      try {
        const preMadeAsset = await this.preMadeProvider.findMatchingAsset(effectiveRequest);
        if (preMadeAsset) {
          return preMadeAsset;
        }
      } catch (error) {
        console.warn('[AssetService] Pre-made asset lookup failed:', error);
      }
    }

    // Step 2: Generate if allowed
    if (effectiveRequest.allowGeneration !== false && this.config.generationEnabled) {
      try {
        return await this.generatedProvider.requestAsset(effectiveRequest);
      } catch (error) {
        console.warn('[AssetService] Generation failed:', error);
        // Fall through to placeholder
      }
    }

    // Step 3: Return placeholder
    return this.getPlaceholderAsset(effectiveRequest);
  }

  /**
   * Check if an asset matching the request is available
   */
  async checkAvailability(request: AssetRequest): Promise<AssetAvailability> {
    const effectiveRequest = this.applyDefaults(request);

    // Check pre-made first
    try {
      const preMadeAvailability = await this.preMadeProvider.checkAvailability(effectiveRequest);
      if (preMadeAvailability.available) {
        return preMadeAvailability;
      }
    } catch (error) {
      // Ignore and continue
    }

    // If generation is enabled, asset can be generated on-demand
    if (this.config.generationEnabled && effectiveRequest.allowGeneration !== false) {
      return {
        available: false,
        estimatedGenerationTimeMs: 30000, // Rough estimate
      };
    }

    return {
      available: false,
    };
  }

  /**
   * Apply default values from config to request
   */
  private applyDefaults(request: AssetRequest): AssetRequest {
    return {
      ...request,
      strategy: request.strategy ?? this.config.defaultStrategy,
      preferCached: request.preferCached ?? this.config.preferCached,
      maxWaitTime: request.maxWaitTime ?? this.config.defaultMaxWaitTime,
      providerId: request.providerId ?? this.config.defaultProvider,
    };
  }

  /**
   * Get a placeholder asset for failed requests
   */
  private getPlaceholderAsset(request: AssetRequest): Asset {
    return {
      ...PLACEHOLDER_ASSET,
      metadata: {
        ...PLACEHOLDER_ASSET.metadata,
        description: `Placeholder for: ${request.sceneId ?? 'unknown scene'}`,
      },
    };
  }

  // ============================================================================
  // Direct Provider Access (for advanced use cases)
  // ============================================================================

  /**
   * Get the pre-made asset provider directly
   *
   * Useful when you specifically want to query pre-made assets only.
   */
  getPreMadeProvider(): PreMadeAssetProvider {
    return this.preMadeProvider;
  }

  /**
   * Get the generated asset provider directly
   *
   * Useful when you specifically want to generate new assets.
   */
  getGeneratedProvider(): GeneratedAssetProvider {
    return this.generatedProvider;
  }

  /**
   * Get current configuration
   */
  getConfig(): AssetServiceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * Creates new provider instances if provider-related config changes.
   */
  updateConfig(config: Partial<AssetServiceConfig>): void {
    const newConfig = { ...this.config, ...config };

    // If provider changed, create new generated provider
    if (newConfig.defaultProvider !== this.config.defaultProvider) {
      this.generatedProvider = new GeneratedAssetProvider({
        defaultProvider: newConfig.defaultProvider,
        defaultMaxWaitTime: newConfig.defaultMaxWaitTime,
      });
    }

    this.config = newConfig;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default AssetService instance
 */
export function createAssetService(
  config: Partial<AssetServiceConfig> = {}
): AssetService {
  return new AssetService(config);
}

/**
 * Create an AssetService for testing (with mock providers)
 */
export function createTestAssetService(
  preMadeProvider?: PreMadeAssetProvider,
  generatedProvider?: GeneratedAssetProvider,
  config: Partial<AssetServiceConfig> = {}
): AssetService {
  return new AssetService(config, preMadeProvider, generatedProvider);
}
