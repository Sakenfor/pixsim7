import type { PixSimApiClient } from '../client';
import type {
  CompositionPackage,
  CompositionRoleDefinition,
} from '@pixsim7/shared.types';
import { toCamelCaseDeep } from '@pixsim7/shared.helpers.core';

interface CompositionRoleResponseDto {
  id: string;
  label: string;
  description: string;
  color: string;
  default_layer: number;
  tags: string[];
  slug_mappings?: string[];
  namespace_mappings?: string[];
}

interface CompositionPackageResponseDto {
  id: string;
  label: string;
  description: string;
  plugin_id?: string | null;
  roles: CompositionRoleResponseDto[];
  recommended_for?: string[];
  version: string;
}

/**
 * Response from GET /composition/packages
 */
export interface CompositionPackagesResponse {
  packages: CompositionPackage[];
  total: number;
}

interface CompositionPackagesResponseDto {
  packages: CompositionPackageResponseDto[];
  total: number;
}

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
      const response = await client.get<CompositionPackagesResponseDto>('/composition/packages');
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
      const params = packageIds?.length
        ? { packages: packageIds.join(',') }
        : undefined;

      const roles = await client.get<CompositionRoleResponseDto[]>('/composition/roles', { params });
      return (roles || []).map(normalizeRole);
    },
  };
}
