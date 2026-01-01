/**
 * Composition Package Types
 *
 * Types for the pluggable composition role system.
 * Packages contribute roles, worlds activate packages.
 *
 * Backend equivalent: domain/composition/package_registry.py
 */

import type { ImageCompositionRole } from './composition-roles.generated';

/**
 * Definition of a composition role contributed by a package.
 */
export interface CompositionRoleDefinition {
  /** Unique role ID (e.g., 'pov_hands', 'main_character') */
  id: string;

  /** Human-readable label (e.g., 'POV Hands', 'Main Character') */
  label: string;

  /** Description of what this role represents */
  description: string;

  /** Tailwind color name for UI badges (e.g., 'amber', 'blue') */
  color: string;

  /** Default layer order (0=background, higher=foreground) */
  defaultLayer: number;

  /** Tags for filtering and asset matching */
  tags: string[];

  /** Exact tag slugs that map to this role */
  slugMappings?: string[];

  /** Tag namespace prefixes that map to this role */
  namespaceMappings?: string[];
}

/**
 * A package that contributes composition roles.
 */
export interface CompositionPackage {
  /** Unique package ID (e.g., 'core.base', 'pov.first_person') */
  id: string;

  /** Human-readable label */
  label: string;

  /** Package description */
  description?: string;

  /** Plugin that registered this package, or undefined for built-in */
  pluginId?: string;

  /** Roles this package contributes */
  roles: CompositionRoleDefinition[];

  /** Game styles this package is recommended for (UI hints) */
  recommendedFor?: string[];

  /** Package version */
  version?: string;
}

/**
 * Slot policy configuration for a world.
 * Stored in world.meta.generation.compositionSlots
 */
export interface CompositionSlotPolicy {
  /** Roles that must have assets assigned */
  required?: string[];

  /** Roles that are available but optional */
  optional?: string[];

  /** Default settings per role */
  defaults?: Record<string, CompositionSlotDefault>;
}

/**
 * Default settings for a composition slot.
 */
export interface CompositionSlotDefault {
  /** Default intent for this slot */
  intent?: 'preserve' | 'modify' | 'generate' | 'add' | 'remove';

  /** Default priority (higher = more important) */
  priority?: number;

  /** Default layer (0=background, higher=foreground) */
  layer?: number;

  /** Whether this slot is locked (runtime-provided, not editable) */
  locked?: boolean;

  /** Default influence type for lineage tracking */
  influenceType?: 'content' | 'style' | 'structure' | 'mask' | 'blend' | 'replacement' | 'reference';
}

/**
 * Extended WorldGenerationConfig with composition fields.
 * These fields are optional extensions to the base config.
 */
export interface CompositionGenerationConfig {
  /** Active composition packages for this world */
  compositionPackages?: string[];

  /** Slot policy configuration */
  compositionSlots?: CompositionSlotPolicy;
}

/**
 * Helper to get available roles from active packages.
 *
 * @param packages - All available packages
 * @param activeIds - IDs of active packages
 * @returns Merged list of role definitions
 */
export function getAvailableRoles(
  packages: CompositionPackage[],
  activeIds: string[]
): CompositionRoleDefinition[] {
  const rolesById = new Map<string, CompositionRoleDefinition>();

  for (const pkgId of activeIds) {
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
export function inferRoleFromTags(
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
