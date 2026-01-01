import type { PixSimApiClient } from '../client';
import type {
  CompositionPackage,
  CompositionRoleDefinition,
} from '@pixsim7/shared.types';

/**
 * Response from GET /composition/packages
 */
export interface CompositionPackagesResponse {
  packages: CompositionPackage[];
  total: number;
}

export function createCompositionApi(client: PixSimApiClient) {
  return {
    /**
     * Get all registered composition packages.
     *
     * Returns packages from core and all enabled plugins.
     * Use getAvailableRoles() from @shared/types to filter by active packages.
     */
    async getPackages(): Promise<CompositionPackage[]> {
      const response = await client.get<CompositionPackagesResponse>('/composition/packages');
      return response.packages;
    },

    /**
     * Get available composition roles.
     *
     * @param packageIds - Optional list of package IDs to filter by.
     *                     If not provided, returns roles from all packages.
     *                     Core package (core.base) is always included.
     */
    async getRoles(packageIds?: string[]): Promise<CompositionRoleDefinition[]> {
      const params = packageIds?.length
        ? { packages: packageIds.join(',') }
        : undefined;

      return client.get<CompositionRoleDefinition[]>('/composition/roles', { params });
    },
  };
}
