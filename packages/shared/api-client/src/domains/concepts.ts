import type { PixSimApiClient } from '../client';

/**
 * Role concept from the /concepts/roles API.
 *
 * Includes all metadata needed for frontend role inference.
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
 */
export interface RolesListResponse {
  roles: RoleConceptResponse[];
  priority: string[];
}

export function createConceptsApi(client: PixSimApiClient) {
  return {
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
     */
    async getRoles(packageIds?: string[]): Promise<RolesListResponse> {
      const params = packageIds?.length
        ? { packages: packageIds.join(',') }
        : undefined;

      return client.get<RolesListResponse>('/concepts/roles', { params });
    },
  };
}
