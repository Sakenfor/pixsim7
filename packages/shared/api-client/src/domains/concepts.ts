import type { PixSimApiClient } from '../client';

// ============================================================================
// Concept Kind Types (Option B: Known + Extensible)
// ============================================================================

/**
 * Known concept kinds with autocomplete support.
 * These are the kinds that ship with the core system.
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
// Concept Kind Metadata
// ============================================================================

/**
 * Metadata about a concept kind from the API.
 */
export interface ConceptKindInfo {
  /** Concept kind identifier */
  kind: string;
  /** Display name for UI grouping */
  group_name: string;
  /** Whether this kind supports package filtering */
  supports_packages: boolean;
  /** Whether to include in label autocomplete suggestions */
  include_in_labels: boolean;
}

/**
 * Response from GET /concepts listing available kinds.
 */
export interface ConceptKindsResponse {
  kinds: ConceptKindInfo[];
}

// ============================================================================
// Generic Concept Types
// ============================================================================

/**
 * Generic concept response from the /concepts/{kind} API.
 *
 * All concept kinds share this base structure with kind-specific
 * metadata in the `metadata` field.
 */
export interface ConceptResponse {
  /** Concept kind (role, part, pose, influence_region, etc.) */
  kind: string;
  /** Concept ID (unique within kind) */
  id: string;
  /** Canonical reference format (kind:id) */
  ref: string;
  /** Human-readable display label */
  label: string;
  /** Longer description */
  description: string;
  /** Tailwind color name for UI */
  color: string;
  /** UI grouping category */
  group: string;
  /** Tags for filtering/matching */
  tags: string[];
  /** Kind-specific additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Generic response for listing concepts of a specific kind.
 */
export interface ConceptsListResponse {
  /** The concept kind returned */
  kind: string;
  /** List of concepts */
  concepts: ConceptResponse[];
  /** Priority ordering of concept IDs (if applicable) */
  priority: string[];
  /** Display name for this kind's group */
  group_name: string;
}

// ============================================================================
// Role-Specific Types (Backward Compatibility)
// ============================================================================

/**
 * Role concept from the /concepts/roles API.
 *
 * Includes all metadata needed for frontend role inference.
 * @deprecated Use ConceptResponse via getConcepts('role') for new code.
 */
export interface RoleConceptResponse {
  id: string;
  label: string;
  description: string;
  color: string;
  default_layer: number;
  tags: string[];
  slug_mappings: string[];
  namespace_mappings: string[];
}

/**
 * Response from GET /concepts/roles
 * @deprecated Use ConceptsListResponse via getConcepts('role') for new code.
 */
export interface RolesListResponse {
  roles: RoleConceptResponse[];
  priority: string[];
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
    getParts: (packageIds?: string[]) => getConcepts('part', packageIds),
    getPoses: (packageIds?: string[]) => getConcepts('pose', packageIds),
    getInfluenceRegions: (packageIds?: string[]) => getConcepts('influence_region', packageIds),

    /**
     * Get composition roles with full metadata for frontend inference.
     *
     * Includes:
     * - All roles from core + active packages (or all if no filter)
     * - Slug/namespace mappings for inferring role from tags
     * - Priority list for conflict resolution
     *
     * This provides plugin roles that build-time generators cannot include.
     * Frontend should merge with generated core constants and dedupe by id.
     *
     * @param packageIds - Optional list of package IDs to filter by.
     *                     If not provided, returns roles from all packages.
     *                     Core package (core.base) is always included.
     * @deprecated Use getConcepts('role') for new code.
     */
    async getRoles(packageIds?: string[]): Promise<RolesListResponse> {
      const params = packageIds?.length
        ? { packages: packageIds.join(',') }
        : undefined;

      return client.get<RolesListResponse>('/concepts/roles', { params });
    },
  };
}
