/**
 * Relationship preview API client
 *
 * Provides async functions for previewing relationship tiers and intimacy levels
 * using the generic stat preview API with world-specific stat configurations.
 *
 * UPDATED: Now uses the generic /api/v1/stats/preview-entity-stats endpoint
 * which works with StatEngine and WorldStatsConfig for all stat types.
 *
 * @backend_authoritative These functions call backend preview APIs
 * @use_cases Editor tools, what-if previews, offline tools with backend connection
 */

import type {
  RelationshipTierPreviewRequest,
  RelationshipTierPreviewResponse,
  RelationshipIntimacyPreviewRequest,
  RelationshipIntimacyPreviewResponse,
} from '@pixsim7/shared.types';

/**
 * Configuration for preview API client
 */
export interface PreviewApiConfig {
  /**
   * Base URL for the backend API
   * Default: /api/v1 (relative to current origin)
   */
  baseUrl?: string;

  /**
   * Custom fetch function (for testing or custom HTTP clients)
   */
  fetch?: typeof fetch;
}

/**
 * Default configuration
 */
const defaultConfig: Required<PreviewApiConfig> = {
  baseUrl: '/api/v1',
  fetch: globalThis.fetch?.bind(globalThis) || fetch,
};

let currentConfig: Required<PreviewApiConfig> = { ...defaultConfig };

/**
 * Configure the preview API client
 *
 * @param config - Configuration options
 *
 * @example
 * ```ts
 * // Use a different backend URL
 * configurePreviewApi({ baseUrl: 'http://localhost:8000/api/v1' });
 *
 * // Use a custom fetch implementation (for testing)
 * configurePreviewApi({ fetch: mockFetch });
 * ```
 */
export function configurePreviewApi(config: PreviewApiConfig): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Reset configuration to defaults
 */
export function resetPreviewApiConfig(): void {
  currentConfig = { ...defaultConfig };
}

/**
 * Get current configuration (for testing)
 */
export function getPreviewApiConfig(): Readonly<Required<PreviewApiConfig>> {
  return currentConfig;
}

/**
 * Preview what relationship tier would result from a given affinity value.
 *
 * Calls the generic stat preview API to compute tier using world-specific StatEngine.
 * This is the recommended way to preview relationship tiers in editor tools.
 *
 * @param args - Preview arguments
 * @returns Promise resolving to tier preview response
 * @throws Error if API call fails or world not found
 *
 * @example
 * ```ts
 * const preview = await previewRelationshipTier({
 *   worldId: 1,
 *   affinity: 75.0,
 *   schemaKey: 'default'
 * });
 *
 * console.log(preview.tierId); // "close_friend"
 * ```
 */
export async function previewRelationshipTier(
  args: RelationshipTierPreviewRequest
): Promise<RelationshipTierPreviewResponse> {
  const { worldId, affinity, schemaKey = 'default' } = args;

  // Use the generic stat preview API with relationship stat definition
  const response = await currentConfig.fetch(
    `${currentConfig.baseUrl}/stats/preview-entity-stats`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        world_id: worldId,
        stat_definition_id: 'relationships',
        values: {
          affinity: affinity,
          trust: 50.0,  // Defaults for tier computation
          chemistry: 50.0,
          tension: 0.0,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.detail?.error || errorData.message || 'Failed to preview relationship tier';
    throw new Error(`Preview API error: ${errorMessage}`);
  }

  const data = await response.json();

  // Extract the affinity tier from normalized stats
  const normalized = data.normalized_stats;

  return {
    tierId: normalized.affinityTierId || null,
    schemaKey: schemaKey,  // Echo back for compatibility
    affinity: normalized.affinity,
  };
}

/**
 * Preview what intimacy level would result from given relationship values.
 *
 * Calls the generic stat preview API to compute intimacy level using world-specific StatEngine.
 * This is the recommended way to preview intimacy levels in editor tools.
 *
 * @param args - Preview arguments
 * @returns Promise resolving to intimacy preview response
 * @throws Error if API call fails or world not found
 *
 * @example
 * ```ts
 * const preview = await previewIntimacyLevel({
 *   worldId: 1,
 *   relationshipValues: {
 *     affinity: 75.0,
 *     trust: 55.0,
 *     chemistry: 70.0,
 *     tension: 15.0
 *   }
 * });
 *
 * console.log(preview.intimacyLevelId); // "intimate"
 * ```
 */
export async function previewIntimacyLevel(
  args: RelationshipIntimacyPreviewRequest
): Promise<RelationshipIntimacyPreviewResponse> {
  const { worldId, relationshipValues } = args;

  // Use the generic stat preview API with relationship stat definition
  const response = await currentConfig.fetch(
    `${currentConfig.baseUrl}/stats/preview-entity-stats`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        world_id: worldId,
        stat_definition_id: 'relationships',
        values: {
          affinity: relationshipValues.affinity,
          trust: relationshipValues.trust,
          chemistry: relationshipValues.chemistry,
          tension: relationshipValues.tension,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.detail?.error || errorData.message || 'Failed to preview intimacy level';
    throw new Error(`Preview API error: ${errorMessage}`);
  }

  const data = await response.json();

  // Extract the level from normalized stats
  const normalized = data.normalized_stats;

  return {
    intimacyLevelId: normalized.levelId || null,
    relationshipValues: {
      affinity: normalized.affinity,
      trust: normalized.trust,
      chemistry: normalized.chemistry,
      tension: normalized.tension,
    },
  };
}
