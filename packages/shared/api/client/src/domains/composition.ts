import type { PixSimApiClient } from '../client';
import type {
  CompositionPackage,
  CompositionRoleDefinition,
} from '@pixsim7/shared.types';
import type {
  CompositionPackageResponse as CompositionPackageResponseDto,
  CompositionPackagesListResponse as CompositionPackagesResponse,
  CompositionRoleResponse as CompositionRoleResponseDto,
} from '@pixsim7/shared.api.model';
export type { CompositionPackagesResponse };
import { toCamelCaseDeep } from '@pixsim7/shared.helpers.core';

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
  };
}
