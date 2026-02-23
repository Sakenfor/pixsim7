import type { PixSimApiClient } from '../client';
import type {
  ConceptKindInfo,
  ConceptKindsResponse,
  ConceptResponse,
  ConceptsListResponse,
} from '@pixsim7/shared.api.model';
export type {
  ConceptKindInfo,
  ConceptKindsResponse,
  ConceptResponse,
  ConceptsListResponse,
};

// ============================================================================
// Concept Kind Types (Option B: Known + Extensible)
// ============================================================================

/**
 * Known concept kinds with autocomplete support.
 * These are the kinds that ship with the core system.
 * [frontend-only] UX helper for autocomplete, not from OpenAPI.
 */
export const KNOWN_KINDS = ['role', 'part', 'pose', 'influence_region'] as const;

/**
 * Known concept kind type for strict contexts (routing, grouping).
 */
export type KnownConceptKind = (typeof KNOWN_KINDS)[number];

/**
 * Concept kind type that allows known kinds plus any string for forward compatibility.
 * Use this for passthrough/fetching or feature-flagged kinds.
 */
export type ConceptKind = KnownConceptKind | (string & {});

/**
 * Type guard to check if a string is a known concept kind.
 */
export function isKnownConceptKind(kind: string): kind is KnownConceptKind {
  return (KNOWN_KINDS as readonly string[]).includes(kind);
}

// ============================================================================
// API Client
// ============================================================================

export function createConceptsApi(client: PixSimApiClient) {
  // Use closures to avoid `this` binding issues when destructuring

  /**
   * Get available concept kinds with metadata.
   * Use this to dynamically discover kinds instead of hardcoding.
   */
  const getConceptKinds = async (): Promise<ConceptKindsResponse> => {
    return client.get<ConceptKindsResponse>('/concepts');
  };

  /**
   * Get concepts of a specific kind.
   */
  const getConcepts = async (
    kind: ConceptKind,
    packageIds?: string[]
  ): Promise<ConceptsListResponse> => {
    const params = packageIds?.length
      ? { packages: packageIds.join(',') }
      : undefined;

    return client.get<ConceptsListResponse>(`/concepts/${kind}`, { params });
  };

  return {
    // Meta endpoint
    getConceptKinds,

    // Generic method
    getConcepts,

    // Convenience methods for known kinds (use closure, not `this`)
    getRoles: (packageIds?: string[]) => getConcepts('role', packageIds),
    getParts: (packageIds?: string[]) => getConcepts('part', packageIds),
    getPoses: (packageIds?: string[]) => getConcepts('pose', packageIds),
    getInfluenceRegions: (packageIds?: string[]) => getConcepts('influence_region', packageIds),
  };
}
