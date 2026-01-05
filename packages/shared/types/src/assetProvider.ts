/**
 * Asset Provider Interface
 *
 * Core abstraction for asset provisioning in game components.
 * Game code depends on this interface, not specific implementations.
 *
 * This enables:
 * - Testability: Mock providers in tests
 * - Flexibility: Swap strategies (cache, pre-made, generated) without changing game code
 * - Decoupling: Game doesn't know about providers, jobs, polling
 */

import type { GenerationStrategy } from './generation';
import type { components } from './openapi.generated';

type MediaType = components['schemas']['MediaType'];

// ============================================================================
// Asset Types
// ============================================================================

export type AssetSource = 'pre-made' | 'generated' | 'cached';

export interface ProviderAssetMetadata {
  /** Content description */
  description?: string;
  /** Content tags for filtering */
  tags?: string[];
  /** Duration in seconds (for video/audio) */
  durationSec?: number;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** MIME type */
  mimeType?: string;
  /** Generation ID if this asset was generated */
  generationId?: number;
  /** Thumbnail URL if available */
  thumbnailUrl?: string;
}

/**
 * Unified asset representation returned by all providers
 */
export interface Asset {
  /** Unique asset identifier */
  id: string;
  /** URL to access the asset */
  url: string;
  /** Media type */
  type: MediaType;
  /** Where this asset came from */
  source: AssetSource;
  /** Additional metadata */
  metadata: ProviderAssetMetadata;
}

// ============================================================================
// Asset Request Types
// ============================================================================

export type AssetStyle = 'anime' | 'realistic' | 'semi-realistic' | 'stylized';

/**
 * Request for an asset
 *
 * Includes game context (scene, choice, character) and generation parameters.
 * The provider uses this to find existing assets or generate new ones.
 */
export interface AssetRequest {
  // ---- Game Context (used for cache keys and asset matching) ----

  /** Scene ID for context-aware asset selection */
  sceneId?: string;
  /** Choice ID for branching content */
  choiceId?: string;
  /** Character ID for character-specific assets */
  characterId?: string;
  /** Location ID for location-specific backgrounds */
  locationId?: string;

  // ---- Generation Parameters ----

  /** Text prompt for generation */
  prompt?: string;
  /** Visual style preference */
  style?: AssetStyle;
  /** Target duration in seconds (for video/audio) */
  duration?: number;
  /** Source image URL for img2vid */
  imageUrl?: string;
  /** Source video URL for video extend */
  videoUrl?: string;

  // ---- Strategy Hints ----

  /**
   * Caching strategy (maps to backend TTL)
   * - 'once': Cache permanently (365 days)
   * - 'per_playthrough': Cache per playthrough (90 days)
   * - 'per_player': Cache per player (180 days)
   * - 'always': No caching, always generate fresh
   */
  strategy?: GenerationStrategy;

  /** Whether to prefer cached results (default: true) */
  preferCached?: boolean;

  /** Whether generation is allowed if no cached/pre-made asset found (default: true) */
  allowGeneration?: boolean;

  /** Maximum time to wait for generation in ms (default: 120000) */
  maxWaitTime?: number;

  // ---- Provider Hints ----

  /** Preferred provider ID (e.g., 'pixverse', 'runway') */
  providerId?: string;

  /** Additional provider-specific parameters */
  providerParams?: Record<string, unknown>;
}

/**
 * Result of checking asset availability
 */
export interface AssetAvailability {
  /** Whether an asset is available without generation */
  available: boolean;
  /** Source if available */
  source?: AssetSource;
  /** Asset ID if available */
  assetId?: string;
  /** Estimated generation time in ms if generation needed */
  estimatedGenerationTimeMs?: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class AssetNotFoundError extends Error {
  constructor(
    public readonly assetId: string,
    message?: string
  ) {
    super(message ?? `Asset not found: ${assetId}`);
    this.name = 'AssetNotFoundError';
  }
}

export class AssetGenerationError extends Error {
  constructor(
    public readonly request: AssetRequest,
    public readonly originalError?: Error,
    message?: string
  ) {
    super(message ?? 'Asset generation failed');
    this.name = 'AssetGenerationError';
  }
}

export class AssetTimeoutError extends Error {
  constructor(
    public readonly request: AssetRequest,
    public readonly timeoutMs: number,
    message?: string
  ) {
    super(message ?? `Asset generation timed out after ${timeoutMs}ms`);
    this.name = 'AssetTimeoutError';
  }
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Core interface for asset provisioning
 *
 * Implementations:
 * - GeneratedAssetProvider: Wraps /api/v1/generations API
 * - PreMadeAssetProvider: Wraps /api/v1/assets API
 * - AssetService: Facade coordinating multiple providers
 */
export interface IAssetProvider {
  /**
   * Get an asset by ID
   *
   * Source (pre-made, generated, cached) is transparent to caller.
   *
   * @throws AssetNotFoundError if asset doesn't exist
   */
  getAsset(assetId: string): Promise<Asset>;

  /**
   * Request an asset matching the given requirements
   *
   * Provider decides: return existing (cached/pre-made) or generate new.
   * The strategy field influences caching behavior.
   *
   * @throws AssetGenerationError if generation fails
   * @throws AssetTimeoutError if generation exceeds maxWaitTime
   */
  requestAsset(request: AssetRequest): Promise<Asset>;

  /**
   * Check if an asset matching the request is available without generation
   *
   * Useful for predictive loading and UI hints.
   */
  checkAvailability(request: AssetRequest): Promise<AssetAvailability>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AssetServiceConfig {
  /** Whether generation is enabled (default: true) */
  generationEnabled: boolean;
  /** Default provider for generation (default: 'pixverse') */
  defaultProvider: string;
  /** Default max wait time for generation in ms (default: 120000) */
  defaultMaxWaitTime: number;
  /** Default strategy for caching (default: 'per_playthrough') */
  defaultStrategy: GenerationStrategy;
  /** Whether to prefer cached results by default (default: true) */
  preferCached: boolean;
}

export const DEFAULT_ASSET_SERVICE_CONFIG: AssetServiceConfig = {
  generationEnabled: true,
  defaultProvider: 'pixverse',
  defaultMaxWaitTime: 120000,
  defaultStrategy: 'per_playthrough',
  preferCached: true,
};
