// Auto-generated from roles vocabulary - DO NOT EDIT
// Re-run: pnpm composition-roles:gen
//
// ========================================================================
// NOTE: For dynamic/plugin-aware data, prefer the runtime API:
//   - compositionPackageStore (apps/main/src/stores/compositionPackageStore.ts)
//   - Fetches from /api/v1/concepts/roles at runtime, including plugin roles
//
// This file provides:
//   - Type definitions (ImageCompositionRole, RoleId) - always valid
//   - Static fallback data when API unavailable
//   - Core role constants for type-safe usage
// ========================================================================

/**
 * Canonical composition roles from core vocab.
 * @see compositionPackageStore.roles for runtime API with plugin roles
 */
export const COMPOSITION_ROLES = ["entities","entities:subject","entities:main_character","entities:companion","entities:placed","entities:prop","world","world:environment","world:setting","camera","camera:angle","camera:fov","camera:composition","lighting","lighting:key","lighting:fill","materials","materials:wardrobe","materials:rendering","materials:atmosphere","materials:romance","animation","animation:action","animation:pose"] as const;

/**
 * Core composition role type, derived from vocab.
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
 * @see compositionPackageStore.getRoleDescription() for runtime API
 */
export const ROLE_DESCRIPTIONS = {
  "entities": "Things in the scene — characters, creatures, objects",
  "entities:subject": "Preservation-locked reference subject for image-edit",
  "entities:main_character": "Primary subject/character in the scene",
  "entities:companion": "Supporting characters (NPCs, pets, monsters)",
  "entities:placed": "Positioned secondary character in the scene",
  "entities:prop": "Objects, vehicles, items",
  "world": "The space, location, and broader setting",
  "world:environment": "Background, setting, location",
  "world:setting": "Broader location, time period, or world context",
  "camera": "Viewpoint and framing controls",
  "camera:angle": "Viewpoint direction (low angle, bird's eye, etc.)",
  "camera:fov": "Field of view / focal length",
  "camera:composition": "Layer ordering, depth arrangement",
  "lighting": "Light sources and illumination",
  "lighting:key": "Primary light source",
  "lighting:fill": "Secondary/fill light source",
  "materials": "Visual treatment, style, and aesthetic",
  "materials:wardrobe": "Clothing, armor, accessories",
  "materials:rendering": "Render style, art direction, aesthetic reference",
  "materials:atmosphere": "Emotional tone, mood, ambiance",
  "materials:romance": "Intimate/romantic visual treatment",
  "animation": "Movement, behavior, and pose directives",
  "animation:action": "Actions, interactions, movement behaviors",
  "animation:pose": "Static pose or body position"
} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Role colors (tailwind color names) for badges/UI.
 * @see compositionPackageStore.getRoleColor() for runtime API
 */
export const ROLE_COLORS = {
  "entities": "blue",
  "entities:subject": "blue",
  "entities:main_character": "blue",
  "entities:companion": "blue",
  "entities:placed": "blue",
  "entities:prop": "blue",
  "world": "green",
  "world:environment": "green",
  "world:setting": "green",
  "camera": "slate",
  "camera:angle": "slate",
  "camera:fov": "slate",
  "camera:composition": "slate",
  "lighting": "amber",
  "lighting:key": "amber",
  "lighting:fill": "amber",
  "materials": "pink",
  "materials:wardrobe": "pink",
  "materials:rendering": "pink",
  "materials:atmosphere": "pink",
  "materials:romance": "pink",
  "animation": "cyan",
  "animation:action": "cyan",
  "animation:pose": "cyan"
} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Default layer order per role (0=background, higher=foreground).
 * @see compositionPackageStore.roles for runtime API
 */
export const ROLE_DEFAULT_LAYERS = {
  "entities": 1,
  "entities:subject": 1,
  "entities:main_character": 1,
  "entities:companion": 1,
  "entities:placed": 1,
  "entities:prop": 1,
  "world": 0,
  "world:environment": 0,
  "world:setting": 0,
  "camera": 2,
  "camera:angle": 2,
  "camera:fov": 2,
  "camera:composition": 2,
  "lighting": 2,
  "lighting:key": 2,
  "lighting:fill": 2,
  "materials": 0,
  "materials:wardrobe": 0,
  "materials:rendering": 0,
  "materials:atmosphere": 0,
  "materials:romance": 0,
  "animation": 2,
  "animation:action": 2,
  "animation:pose": 2
} as const satisfies Record<ImageCompositionRole, number>;

/**
 * Role tags for filtering and asset matching.
 * @see compositionPackageStore.roles for runtime API
 */
export const ROLE_TAGS = {
  "entities": [
    "character",
    "subject",
    "object"
  ],
  "entities:subject": [
    "subject",
    "preserve",
    "lock"
  ],
  "entities:main_character": [
    "character",
    "subject",
    "primary"
  ],
  "entities:companion": [
    "character",
    "secondary",
    "npc"
  ],
  "entities:placed": [
    "character",
    "placed",
    "positioned"
  ],
  "entities:prop": [
    "object",
    "item",
    "prop"
  ],
  "world": [
    "background",
    "setting",
    "location"
  ],
  "world:environment": [
    "background",
    "setting",
    "location"
  ],
  "world:setting": [
    "setting",
    "world",
    "period"
  ],
  "camera": [
    "camera",
    "viewpoint",
    "framing"
  ],
  "camera:angle": [
    "camera",
    "angle",
    "viewpoint"
  ],
  "camera:fov": [
    "camera",
    "fov",
    "lens"
  ],
  "camera:composition": [
    "camera",
    "composition",
    "depth"
  ],
  "lighting": [
    "lighting",
    "light"
  ],
  "lighting:key": [
    "lighting",
    "key",
    "primary"
  ],
  "lighting:fill": [
    "lighting",
    "fill",
    "secondary"
  ],
  "materials": [
    "style",
    "material",
    "aesthetic"
  ],
  "materials:wardrobe": [
    "wardrobe",
    "clothing",
    "outfit"
  ],
  "materials:rendering": [
    "style",
    "reference",
    "aesthetic",
    "rendering"
  ],
  "materials:atmosphere": [
    "mood",
    "atmosphere",
    "tone"
  ],
  "materials:romance": [
    "romance",
    "intimate"
  ],
  "animation": [
    "animation",
    "movement",
    "action"
  ],
  "animation:action": [
    "action",
    "interaction",
    "movement"
  ],
  "animation:pose": [
    "pose",
    "position",
    "stance"
  ]
} as const satisfies Record<ImageCompositionRole, readonly string[]>;

/**
 * Tag slug -> composition role mapping.
 * Exact match lookup (e.g., "bg", "char:hero").
 * @see compositionPackageStore.slugToRole for runtime API
 */
export const SLUG_TO_COMPOSITION_ROLE = {
  "bg": "world:environment",
  "role:bg": "world:environment",
  "role:environment": "world:environment",
  "role:setting": "world:setting",
  "char:hero": "entities:main_character",
  "pov:player": "entities:main_character",
  "role:char": "entities:main_character",
  "role:character": "entities:main_character",
  "char:npc": "entities:companion",
  "char:monster": "entities:companion",
  "comic_frame": "materials:rendering"
} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Tag namespace -> composition role mapping.
 * Used after extracting prefix before ":" (e.g., "npc:alex" -> "npc").
 * @see compositionPackageStore.namespaceToRole for runtime API
 */
export const NAMESPACE_TO_COMPOSITION_ROLE = {
  "character": "entities:main_character",
  "person": "entities:main_character",
  "npc": "entities:main_character",
  "animal": "entities:companion",
  "creature": "entities:companion",
  "object": "entities:prop",
  "prop": "entities:prop",
  "vehicle": "entities:prop",
  "location": "world:environment",
  "environment": "world:environment",
  "setting": "world:environment",
  "background": "world:environment",
  "scene": "world:environment",
  "place": "world:environment",
  "style": "materials:rendering",
  "lighting": "lighting:key",
  "camera": "camera:angle"
} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Priority order for role selection (highest first).
 * When multiple tags map to different roles, pick the highest priority.
 * @see compositionPackageStore.priority for runtime API
 */
export const COMPOSITION_ROLE_PRIORITY = ["entities:subject","entities:main_character","entities:companion","entities:placed","entities:prop","materials:rendering","materials:wardrobe","materials:atmosphere","materials:romance","camera:angle","camera:fov","camera:composition","lighting:key","lighting:fill","animation:action","animation:pose","world:environment","world:setting"] as const satisfies readonly ImageCompositionRole[];

/**
 * Group role IDs (top-level categories, not assignable to assets).
 */
export const ROLE_GROUPS = ["entities","world","camera","lighting","materials","animation"] as const;

/**
 * Leaf role IDs (assignable to assets).
 */
export const LEAF_COMPOSITION_ROLES = ["entities:subject","entities:main_character","entities:companion","entities:placed","entities:prop","world:environment","world:setting","camera:angle","camera:fov","camera:composition","lighting:key","lighting:fill","materials:wardrobe","materials:rendering","materials:atmosphere","materials:romance","animation:action","animation:pose"] as const;

/**
 * Leaf role → parent group mapping.
 * e.g. "entities:main_character" → "entities"
 */
export const ROLE_PARENTS = {
  "entities:subject": "entities",
  "entities:main_character": "entities",
  "entities:companion": "entities",
  "entities:placed": "entities",
  "entities:prop": "entities",
  "world:environment": "world",
  "world:setting": "world",
  "camera:angle": "camera",
  "camera:fov": "camera",
  "camera:composition": "camera",
  "lighting:key": "lighting",
  "lighting:fill": "lighting",
  "materials:wardrobe": "materials",
  "materials:rendering": "materials",
  "materials:atmosphere": "materials",
  "materials:romance": "materials",
  "animation:action": "animation",
  "animation:pose": "animation"
} as const satisfies Partial<Record<ImageCompositionRole, string>>;

/**
 * Infer composition role from a single tag string.
 *
 * Strategy:
 * 1. Check exact slug match (e.g., "bg", "char:hero")
 * 2. Extract namespace prefix (e.g., "npc:alex" -> "npc") and check namespace mapping
 *
 * @see compositionPackageStore.inferRoleFromTag() for runtime API with plugin roles
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
 *
 * @see compositionPackageStore.inferRoleFromTags() for runtime API with plugin roles
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
