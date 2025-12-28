// Auto-generated from pixsim7/backend/main/shared/composition-roles.yaml - DO NOT EDIT
// Re-run: pnpm composition-roles:gen

import type { ImageCompositionRole } from './generation';

/**
 * Tag slug -> composition role mapping.
 * Exact match lookup (e.g., "bg", "char:hero").
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
 */
export const COMPOSITION_ROLE_PRIORITY = ["main_character","companion","prop","style_reference","effect","environment"] as const satisfies readonly ImageCompositionRole[];

/**
 * Infer composition role from a single tag string.
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
