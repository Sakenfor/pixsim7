/**
 * Composition Package Helpers
 *
 * Runtime logic for composition packages and role resolution.
 * Types are imported from @pixsim7/shared.types.
 */
import type {
  CompositionPackage,
  CompositionRoleDefinition,
} from '@pixsim7/shared.types';
import { CORE_COMPOSITION_PACKAGE_ID } from '@pixsim7/shared.types';

/**
 * Helper to get available roles from active packages.
 *
 * @param packages - All available packages
 * @param activeIds - IDs of active packages
 * @returns Merged list of role definitions
 */
export function getAvailableRoles(
  packages: CompositionPackage[],
  activeIds: string[] = []
): CompositionRoleDefinition[] {
  const rolesById = new Map<string, CompositionRoleDefinition>();
  const resolvedIds = activeIds.length ? activeIds : packages.map((pkg) => pkg.id);
  const packageIds = [
    CORE_COMPOSITION_PACKAGE_ID,
    ...resolvedIds.filter((pkgId) => pkgId !== CORE_COMPOSITION_PACKAGE_ID),
  ];

  for (const pkgId of packageIds) {
    const pkg = packages.find((p) => p.id === pkgId);
    if (!pkg) continue;

    for (const role of pkg.roles) {
      rolesById.set(role.id, role);
    }
  }

  return Array.from(rolesById.values());
}

/**
 * Helper to infer role from asset tags using package mappings.
 *
 * @param tags - Asset tags to check
 * @param roles - Available role definitions
 * @returns Matching role ID or undefined
 */
export function inferRoleFromPackageTags(
  tags: string[],
  roles: CompositionRoleDefinition[]
): string | undefined {
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();

    // Check slug mappings first (exact match)
    for (const role of roles) {
      if (role.slugMappings?.includes(normalized)) {
        return role.id;
      }
    }

    // Check namespace mappings (prefix match)
    const colonIdx = normalized.indexOf(':');
    if (colonIdx > 0) {
      const namespace = normalized.slice(0, colonIdx);
      for (const role of roles) {
        if (role.namespaceMappings?.includes(namespace)) {
          return role.id;
        }
      }
    }
  }

  return undefined;
}

// ============================================================================
// Layer–Role Binding
// ============================================================================

export type {
  LayerIntent,
  LayerInfluenceType,
  BoundLayer,
} from './layerRoleBinding';

export {
  META_ROLE_ID,
  META_INTENT,
  META_INFLUENCE_TYPE,
  META_INFLUENCE_REGION,
  bindLayersToRoles,
  applyRoleLayerDefaults,
  toBoundCompositionSlots,
} from './layerRoleBinding';
