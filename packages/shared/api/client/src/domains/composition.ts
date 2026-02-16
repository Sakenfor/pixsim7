import type { PixSimApiClient } from '../client';
import type {
  ApiComponents,
  ApiOperations,
  CompositionPackage,
  CompositionRoleDefinition,
} from '@pixsim7/shared.types';
import { toCamelCaseDeep } from '@pixsim7/shared.helpers.core';

type Schemas = ApiComponents['schemas'];
type CompositionRoleResponseDto = Schemas['CompositionRoleResponse'];
type CompositionPackageResponseDto = Schemas['CompositionPackageResponse'];
type ListRolesQuery = ApiOperations['list_roles_api_v1_composition_roles_get']['parameters']['query'];

/**
 * Response from GET /composition/packages
 */
export type CompositionPackagesResponse = Schemas['CompositionPackagesListResponse'];

function normalizeRole(raw: CompositionRoleResponseDto): CompositionRoleDefinition {
  const camel = toCamelCaseDeep(raw as unknown as Record<string, unknown>) as unknown as CompositionRoleDefinition;
  return {
    ...camel,
    tags: camel.tags ?? [],
  };
}

function normalizePackage(raw: CompositionPackageResponseDto): CompositionPackage {
  const camel = toCamelCaseDeep(raw as unknown as Record<string, unknown>) as unknown as Omit<CompositionPackage, 'roles'> & {
    roles?: CompositionRoleDefinition[];
  };

  return {
    ...camel,
    roles: (raw.roles || []).map(normalizeRole),
  };
}

export function createCompositionApi(client: PixSimApiClient) {
  return {
    /**
     * Get all registered composition packages.
     *
     * Returns packages from core and all enabled plugins.
     * Use getAvailableRoles() from @pixsim7/shared.types to filter by active packages.
     */
    async getPackages(): Promise<CompositionPackage[]> {
      const response = await client.get<CompositionPackagesResponse>('/composition/packages');
      return (response.packages || []).map(normalizePackage);
    },

    /**
     * Get available composition roles.
     *
     * @param packageIds - Optional list of package IDs to filter by.
     *                     If not provided, returns roles from all packages.
     *                     Core package (core.base) is always included.
     */
    async getRoles(packageIds?: string[]): Promise<CompositionRoleDefinition[]> {
      const params: ListRolesQuery | undefined = packageIds?.length
        ? { packages: packageIds.join(',') }
        : undefined;

      const roles = await client.get<readonly CompositionRoleResponseDto[]>('/composition/roles', { params });
      return (roles || []).map(normalizeRole);
    },
  };
}
