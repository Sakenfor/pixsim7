/**
 * blockVisuals — shared, non-ad-hoc resolution of a prompt block's icon.
 *
 * Single source of truth: composition-role icons live in the role vocabulary
 * (`roles.yaml` → `icon:`), flow through codegen into `ROLE_ICONS`, and are
 * also served at runtime via `compositionPackageStore.getRoleIcon()` (plugin
 * aware). Any surface that renders a block name + icon should resolve through
 * here instead of hardcoding icons per panel.
 *
 * Resolution order for a block:
 *   1. its `composition_role` (exact, then namespace-group fallback)
 *   2. a role *inferred* from its `category` — many blocks carry only a
 *      category (e.g. "camera") with no explicit role; we reuse the vocab's
 *      slug/namespace mappings so those still get a meaningful icon
 *   3. its `kind` (small curated override table)
 *   4. generic `blocks` icon
 *
 * For plugin-contributed roles not present in the static `ROLE_ICONS`, prefer
 * the runtime `compositionPackageStore.getRoleIcon(roleId)`.
 */

import {
  ROLE_ICONS,
  NAMESPACE_TO_COMPOSITION_ROLE,
  inferRoleFromTag,
} from '@pixsim7/shared.types/composition-roles.generated';

import type { IconName } from '@lib/icons';

/** Generic fallback when a block has no role/kind icon. */
export const FALLBACK_BLOCK_ICON: IconName = 'blocks';

const ROLE_ICON_MAP = ROLE_ICONS as Record<string, string>;
const NAMESPACE_MAP = NAMESPACE_TO_COMPOSITION_ROLE as Record<string, string>;

/**
 * Optional `kind` → icon overrides for blocks that carry no composition role.
 * Intentionally minimal; extend as block kinds gain meaningful icons.
 */
const KIND_ICONS: Record<string, IconName> = {};

/**
 * Cosmetic icons for op-family / modifier-family categories that intentionally
 * carry NO composition role (e.g. `core_direction`, `core_manner`). These are
 * deliberately NOT routed through the role vocabulary's slug/namespace maps —
 * doing so would alter backend role *inference*, not just the icon. Keys are
 * lowercase category names. Extend as new op-family categories appear.
 */
const CATEGORY_ICONS: Record<string, IconName> = {
  mood: 'drama',
  direction: 'move',
  manner: 'sliders',
  continuity: 'link',
  interaction_beat: 'users',
  latin_enhancer: 'sparkles',
  character_anatomy: 'user',
};

/**
 * Resolve a composition role id to an icon name.
 * Falls back from a leaf role (`entities:subject`) to its group (`entities`).
 */
export function getRoleIcon(roleId?: string | null): IconName {
  if (!roleId) return FALLBACK_BLOCK_ICON;
  const exact = ROLE_ICON_MAP[roleId];
  if (exact) return exact as IconName;
  const group = roleId.split(':')[0];
  const groupIcon = ROLE_ICON_MAP[group];
  return (groupIcon as IconName) ?? FALLBACK_BLOCK_ICON;
}

/**
 * Best-effort composition role for a free-text category, reusing the vocab's
 * slug/namespace inference. Returns a role id or undefined.
 *   "camera"      → "camera"          (category names a role group directly)
 *   "light"       → "lighting:key"    (namespace mapping)
 *   "char:hero"   → "entities:..."    (slug / ns:value inference)
 */
function inferRoleFromCategory(category: string): string | undefined {
  const c = category.toLowerCase().trim();
  if (!c) return undefined;
  // Category may itself name a role or role group (e.g. "camera").
  if (ROLE_ICON_MAP[c]) return c;
  // Bare namespace word (e.g. "light", "environment").
  if (c in NAMESPACE_MAP) return NAMESPACE_MAP[c];
  // Slug or "namespace:value" forms.
  return inferRoleFromTag(c);
}

/**
 * Resolve an icon for a free-text category: first via an inferred composition
 * role (vocab), then the cosmetic op-family table. Returns undefined if neither
 * matches.
 */
function iconForCategory(category: string): IconName | undefined {
  const inferred = inferRoleFromCategory(category);
  if (inferred) return getRoleIcon(inferred);
  return CATEGORY_ICONS[category.toLowerCase().trim()];
}

/**
 * Resolve an icon for a block category, preferring any composition roles
 * actually present in that category, else inferring from the category name.
 */
export function getCategoryIcon(
  category: string,
  roleHints?: readonly string[],
): IconName {
  if (roleHints && roleHints.length > 0) return getRoleIcon(roleHints[0]);
  return iconForCategory(category) ?? FALLBACK_BLOCK_ICON;
}

/**
 * Resolve a block to an icon name. Keys on `composition_role`, then its
 * `category` (inferred role, then op-family table), then `kind`, then the
 * generic fallback.
 */
export function getBlockIcon(block: {
  composition_role?: string | null;
  category?: string | null;
  kind?: string | null;
}): IconName {
  if (block.composition_role) return getRoleIcon(block.composition_role);
  if (block.category) {
    const fromCategory = iconForCategory(block.category);
    if (fromCategory) return fromCategory;
  }
  if (block.kind && KIND_ICONS[block.kind]) return KIND_ICONS[block.kind];
  return FALLBACK_BLOCK_ICON;
}
