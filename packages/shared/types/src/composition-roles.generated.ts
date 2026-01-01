// Auto-generated from composition-roles.yaml - DO NOT EDIT
// Re-run: pnpm composition-roles:gen
//
// ⚠️  DEPRECATED: This file is deprecated for runtime use.
// Frontend should use compositionPackageStore (apps/main/src/stores/compositionPackageStore.ts)
// which fetches roles from /api/v1/concepts/roles at runtime, including plugin roles.
//
// This file remains for:
// - Backward compatibility with existing imports
// - Type definitions (ImageCompositionRole, RoleId)
// - Fallback when API is unavailable

/**
 * Canonical composition roles from core YAML.
 * @deprecated Use compositionPackageStore.roles from runtime API instead.
 */
export const COMPOSITION_ROLES = ["main_character","companion","environment","prop","style_reference","effect"] as const;

/**
 * Core composition role type, derived from YAML.
 * Only includes core roles - not plugin-contributed ones.
 */
export type ImageCompositionRole = typeof COMPOSITION_ROLES[number];

/**
 * Flexible role ID type that includes core + plugin roles.
 * Use this for runtime data that may contain plugin-contributed role IDs.
 */
export type RoleId = ImageCompositionRole | (string & {});

/**
 * Role descriptions for UI display.
 * @deprecated Use compositionPackageStore.getRoleDescription() instead.
 */
export const ROLE_DESCRIPTIONS = {
  "main_character": "Primary subject/character in the scene",
  "companion": "Supporting characters (NPCs, pets, monsters)",
  "environment": "Background, setting, location",
  "prop": "Objects, vehicles, items",
  "style_reference": "Style/aesthetic reference images",
  "effect": "Lighting, camera, visual effects"
} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Role colors (tailwind color names) for badges/UI.
 * @deprecated Use compositionPackageStore.getRoleColor() instead.
 */
export const ROLE_COLORS = {
  "main_character": "blue",
  "companion": "purple",
  "environment": "green",
  "prop": "orange",
  "style_reference": "pink",
  "effect": "cyan"
} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Default layer order per role (0=background, higher=foreground).
 * @deprecated Use role.default_layer from compositionPackageStore.roles instead.
 */
export const ROLE_DEFAULT_LAYERS = {
  "main_character": 1,
  "companion": 1,
  "environment": 0,
  "prop": 1,
  "style_reference": 0,
  "effect": 2
} as const satisfies Record<ImageCompositionRole, number>;

/**
 * Role tags for filtering and asset matching.
 * @deprecated Use role.tags from compositionPackageStore.roles instead.
 */
export const ROLE_TAGS = {
  "main_character": [
    "character",
    "subject",
    "primary"
  ],
  "companion": [
    "character",
    "secondary",
    "npc"
  ],
  "environment": [
    "background",
    "setting",
    "location"
  ],
  "prop": [
    "object",
    "item",
    "prop"
  ],
  "style_reference": [
    "style",
    "reference",
    "aesthetic"
  ],
  "effect": [
    "effect",
    "lighting",
    "camera"
  ]
} as const satisfies Record<ImageCompositionRole, readonly string[]>;

/**
 * Tag slug -> composition role mapping.
 * Exact match lookup (e.g., "bg", "char:hero").
 * @deprecated Use compositionPackageStore.slugToRole instead.
 */
export const SLUG_TO_COMPOSITION_ROLE = {
  "bg": "environment",
  "role:bg": "environment",
  "role:environment": "environment",
  "role:setting": "environment",
  "char:hero": "main_character",
  "pov:player": "main_character",
  "role:char": "main_character",
  "role:character": "main_character",
  "char:npc": "companion",
  "char:monster": "companion",
  "comic_frame": "style_reference"
} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Tag namespace -> composition role mapping.
 * Used after extracting prefix before ":" (e.g., "npc:alex" -> "npc").
 * @deprecated Use compositionPackageStore.namespaceToRole instead.
 */
export const NAMESPACE_TO_COMPOSITION_ROLE = {
  "character": "main_character",
  "person": "main_character",
  "npc": "main_character",
  "animal": "companion",
  "creature": "companion",
  "object": "prop",
  "prop": "prop",
  "vehicle": "prop",
  "location": "environment",
  "environment": "environment",
  "setting": "environment",
  "background": "environment",
  "scene": "environment",
  "place": "environment",
  "style": "style_reference",
  "lighting": "effect",
  "camera": "effect"
} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Priority order for role selection (highest first).
 * When multiple tags map to different roles, pick the highest priority.
 * @deprecated Use compositionPackageStore.priority instead.
 */
export const COMPOSITION_ROLE_PRIORITY = ["main_character","companion","prop","style_reference","effect","environment"] as const satisfies readonly ImageCompositionRole[];

/**
 * Infer composition role from a single tag string.
 * @deprecated Use compositionPackageStore.inferRoleFromTag() instead.
 *
 * Strategy:
 * 1. Check exact slug match (e.g., "bg", "char:hero")
 * 2. Extract namespace prefix (e.g., "npc:alex" -> "npc") and check namespace mapping
 *
 * @param tag - Tag string (e.g., "bg", "npc:alex", "loc:dungeon")
 * @returns Canonical composition role or undefined
 */
export function inferRoleFromTag(tag: string): ImageCompositionRole | undefined {
  const normalized = tag.toLowerCase().trim();

  // 1. Direct slug match
  if (normalized in SLUG_TO_COMPOSITION_ROLE) {
    return SLUG_TO_COMPOSITION_ROLE[normalized as keyof typeof SLUG_TO_COMPOSITION_ROLE];
  }

  // 2. Namespace extraction (split on first colon)
  const colonIdx = normalized.indexOf(':');
  if (colonIdx > 0) {
    const namespace = normalized.slice(0, colonIdx);
    if (namespace in NAMESPACE_TO_COMPOSITION_ROLE) {
      return NAMESPACE_TO_COMPOSITION_ROLE[namespace as keyof typeof NAMESPACE_TO_COMPOSITION_ROLE];
    }
  }

  return undefined;
}

/**
 * Infer composition role from multiple tags.
 * Returns highest-priority role found.
 * @deprecated Use compositionPackageStore.inferRoleFromTags() instead.
 *
 * @param tags - Array of tag strings
 * @returns Highest-priority canonical composition role found, or undefined
 */
export function inferRoleFromTags(tags: string[]): ImageCompositionRole | undefined {
  const found = new Set<ImageCompositionRole>();
  for (const tag of tags) {
    const role = inferRoleFromTag(tag);
    if (role) found.add(role);
  }
  // Return highest priority role
  for (const role of COMPOSITION_ROLE_PRIORITY) {
    if (found.has(role)) return role;
  }
  return undefined;
}
