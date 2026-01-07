/**
 * Stat Preview API Client
 *
 * Typed API helper for previewing stat computations via the backend.
 * Backend is the single source of truth for all stat computations.
 *
 * @backend_authoritative These functions call backend preview APIs
 * @use_cases Editor tools, what-if previews, offline tools with backend connection
 */

import type {
  RelationshipTierPreviewRequest,
  RelationshipTierPreviewResponse,
  RelationshipIntimacyPreviewRequest,
  RelationshipIntimacyPreviewResponse,
  RelationshipValues,
} from '@pixsim7/shared.types';

/**
 * Request for previewing derived stat computation.
 */
export interface DerivedStatPreviewRequest {
  /** World ID for context (0 or undefined = editor mode with default packages) */
  worldId?: number;
  /** The derived stat to compute (e.g., "mood") */
  targetStatId: string;
  /** Input stat values: { statDefId: { axisName: value } } */
  inputValues: Record<string, Record<string, number>>;
  /** Optional explicit package IDs to use (overrides world config) */
  packageIds?: string[];
}

/**
 * Response from derived stat preview.
 */
export interface DerivedStatPreviewResponse {
  /** The target stat ID */
  targetStatId: string;
  /** The computed derived values (axis values + label/levelId) */
  derivedValues: Record<string, unknown>;
  /** Input axes that contributed to the derivation */
  inputAxes: string[];
  /** Per-axis tier IDs computed by backend */
  tiers: Record<string, string>;
}

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
  // Send all values from the request (supports dynamic axes)
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
        values: relationshipValues,
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

  // Return all values from normalized response (supports dynamic axes)
  const responseValues: RelationshipValues = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'number') {
      responseValues[key] = value;
    }
  }

  return {
    intimacyLevelId: normalized.levelId || null,
    relationshipValues: responseValues,
  };
}

/**
 * Preview what derived stat values would result from given input values.
 *
 * Calls the backend DerivationEngine to compute derived stats using
 * semantic type mappings. This is the authoritative way to preview
 * derived stat computations.
 *
 * @param args - Preview arguments
 * @returns Promise resolving to derived stat response
 * @throws Error if API call fails or derivation not available
 *
 * @example
 * ```ts
 * // Preview mood derived from relationship values
 * const preview = await previewDerivedStat({
 *   worldId: 1,
 *   targetStatId: 'mood',
 *   inputValues: {
 *     relationships: {
 *       affinity: 75.0,
 *       trust: 55.0,
 *       chemistry: 70.0,
 *       tension: 15.0
 *     }
 *   }
 * });
 *
 * console.log(preview.derivedValues.valence); // 72.5
 * console.log(preview.derivedValues.arousal); // 60.0
 * console.log(preview.derivedValues.label);   // "happy"
 * ```
 */
export async function previewDerivedStat(
  args: DerivedStatPreviewRequest
): Promise<DerivedStatPreviewResponse> {
  const { worldId, targetStatId, inputValues, packageIds } = args;

  const requestBody: Record<string, unknown> = {
    world_id: worldId ?? 0, // 0 = editor mode with default packages
    target_stat_id: targetStatId,
    input_values: inputValues,
  };

  if (packageIds) {
    requestBody.package_ids = packageIds;
  }

  const response = await currentConfig.fetch(
    `${currentConfig.baseUrl}/stats/preview-derived-stats`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      errorData.detail?.error ||
      errorData.detail?.hint ||
      errorData.message ||
      'Failed to preview derived stat';
    throw new Error(`Preview API error: ${errorMessage}`);
  }

  const data = await response.json();

  return {
    targetStatId: data.target_stat_id,
    derivedValues: data.derived_values,
    inputAxes: data.input_axes || [],
    tiers: data.tiers || {},
  };
}
