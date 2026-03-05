#!/usr/bin/env tsx
/**
 * Generates TypeScript constants from composition roles vocabulary
 *
 * Source:  merged plugin roles.yaml files under pixsim7/backend/main/plugins/<plugin>/vocabularies/
 * Output:  packages/shared/types/src/composition-roles.generated.ts
 *
 * Usage:
 *   pnpm composition-roles:gen       # Generate types
 *   pnpm composition-roles:check     # Verify generated file is current (CI)
 *
 * This script is run during prebuild to ensure the generated file
 * is always present and current for CI/clean installs.
 *
 * Merge rules (same as runtime VocabularyRegistry):
 *   - Roles are merged across plugins; duplicate role IDs cause a fatal error
 *   - slug_mappings / namespace_mappings / category_mappings are merged (last wins)
 *   - priority list is taken from the last plugin that provides one
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

const CHECK_MODE = process.argv.includes('--check');

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
// Handle Windows paths (remove leading / from /C:/...)
const normalizedDir = process.platform === 'win32' && SCRIPT_DIR.startsWith('/')
  ? SCRIPT_DIR.slice(1)
  : SCRIPT_DIR;

const PLUGINS_DIR = path.resolve(normalizedDir, '../../pixsim7/backend/main/plugins');
const OUT_PATH = path.resolve(normalizedDir, '../../packages/shared/types/src/composition-roles.generated.ts');

// Validate plugins directory exists
if (!fs.existsSync(PLUGINS_DIR)) {
  console.error(`✗ Missing plugins directory: ${PLUGINS_DIR}`);
  console.error('  Ensure pixsim7/backend/main/plugins exists.');
  process.exit(1);
}

// ── Merge roles from all plugin packs ────────────────────────────────────

interface RoleEntry {
  label?: string;
  description: string;
  color: string;
  default_layer?: number;
  defaultLayer?: number;
  tags?: string[];
  is_group?: boolean;
  aliases?: string[];
  slots?: Record<string, unknown>;
  default_influence?: string;
}

const mergedRoles: Record<string, RoleEntry> = {};
const roleOwners: Record<string, string> = {};
let mergedSlugMappings: Record<string, string> = {};
let mergedNamespaceMappings: Record<string, string> = {};
let mergedCategoryMappings: Record<string, string> = {};
let mergedPriority: string[] = [];
let sourcesFound = 0;

for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const pluginId = entry.name;
  const rolesYamlPath = path.join(PLUGINS_DIR, pluginId, 'vocabularies', 'roles.yaml');
  if (!fs.existsSync(rolesYamlPath)) continue;

  let data: Record<string, unknown>;
  try {
    data = yaml.parse(fs.readFileSync(rolesYamlPath, 'utf8'));
  } catch (err) {
    console.error(`✗ Failed to parse ${rolesYamlPath}:`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  sourcesFound++;

  // Merge roles (fail on duplicate IDs)
  const roles = (data.roles ?? {}) as Record<string, RoleEntry>;
  for (const [rawId, roleData] of Object.entries(roles)) {
    const roleId = normalizeRoleId(rawId);
    const existing = roleOwners[roleId];
    if (existing && existing !== pluginId) {
      console.error(`✗ Duplicate composition role '${roleId}' across plugins '${existing}' and '${pluginId}'`);
      process.exit(1);
    }
    roleOwners[roleId] = pluginId;
    mergedRoles[`role:${roleId}`] = roleData;
  }

  // Merge mappings (last plugin wins for same key)
  const slugs = (data.slug_mappings ?? {}) as Record<string, string>;
  mergedSlugMappings = { ...mergedSlugMappings, ...slugs };

  const namespaces = (data.namespace_mappings ?? {}) as Record<string, string>;
  mergedNamespaceMappings = { ...mergedNamespaceMappings, ...namespaces };

  const categories = (data.category_mappings ?? {}) as Record<string, string>;
  mergedCategoryMappings = { ...mergedCategoryMappings, ...categories };

  // Priority: last plugin with a priority list wins
  const priority = data.priority as string[] | undefined;
  if (Array.isArray(priority) && priority.length > 0) {
    mergedPriority = priority;
  }
}

if (sourcesFound === 0) {
  console.error(`✗ No roles.yaml found in any plugin under ${PLUGINS_DIR}`);
  console.error('  Ensure at least one plugin provides vocabularies/roles.yaml.');
  process.exit(1);
}

// ── Normalize and extract ────────────────────────────────────────────────

const normalizeRoleMapping = (mapping: Record<string, string>) => (
  Object.fromEntries(
    Object.entries(mapping).map(([k, v]) => [k.toLowerCase(), normalizeRoleId(String(v))])
  )
);

const slugMappings = normalizeRoleMapping(mergedSlugMappings);
const namespaceMappings = normalizeRoleMapping(mergedNamespaceMappings);
const priority = mergedPriority.map((role) => normalizeRoleId(role));

const rolesData = mergedRoles;
const allRoleIds = Object.keys(rolesData).map((role) => normalizeRoleId(role));
const roles = allRoleIds;
const descriptions = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [normalizeRoleId(k), v.description])
);
const colors = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [normalizeRoleId(k), v.color])
);
const defaultLayers = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [
    normalizeRoleId(k),
    v.default_layer ?? v.defaultLayer ?? 0,
  ])
);
const roleTags = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [normalizeRoleId(k), v.tags ?? []])
);

// Hierarchical metadata
const roleGroups = allRoleIds.filter((id) => rolesData[`role:${id}`]?.is_group === true);
const leafRoles = allRoleIds.filter((id) => rolesData[`role:${id}`]?.is_group !== true);
const roleParents: Record<string, string> = {};
for (const id of allRoleIds) {
  if (rolesData[`role:${id}`]?.is_group) continue;
  const colonIdx = id.indexOf(':');
  if (colonIdx > 0) {
    roleParents[id] = id.slice(0, colonIdx);
  }
}

// ── Generate TypeScript output ───────────────────────────────────────────

const output = `// Auto-generated from composition roles vocabulary - DO NOT EDIT
// Re-run: pnpm composition-roles:gen
//
// Source: merged plugin roles.yaml files under pixsim7/backend/main/plugins/<plugin>/vocabularies/
//
// ========================================================================
// NOTE: For dynamic/plugin-aware data, prefer the runtime API:
//   - compositionPackageStore (apps/main/src/stores/compositionPackageStore.ts)
//   - Fetches from /api/v1/concepts/role at runtime, including plugin roles
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
export const COMPOSITION_ROLES = ${JSON.stringify(roles)} as const;

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
export const ROLE_DESCRIPTIONS = ${JSON.stringify(descriptions, null, 2)} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Role colors (tailwind color names) for badges/UI.
 * @see compositionPackageStore.getRoleColor() for runtime API
 */
export const ROLE_COLORS = ${JSON.stringify(colors, null, 2)} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Default layer order per role (0=background, higher=foreground).
 * @see compositionPackageStore.roles for runtime API
 */
export const ROLE_DEFAULT_LAYERS = ${JSON.stringify(defaultLayers, null, 2)} as const satisfies Record<ImageCompositionRole, number>;

/**
 * Role tags for filtering and asset matching.
 * @see compositionPackageStore.roles for runtime API
 */
export const ROLE_TAGS = ${JSON.stringify(roleTags, null, 2)} as const satisfies Record<ImageCompositionRole, readonly string[]>;

/**
 * Tag slug -> composition role mapping.
 * Exact match lookup (e.g., "bg", "char:hero").
 * @see compositionPackageStore.slugToRole for runtime API
 */
export const SLUG_TO_COMPOSITION_ROLE = ${JSON.stringify(slugMappings, null, 2)} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Tag namespace -> composition role mapping.
 * Used after extracting prefix before ":" (e.g., "npc:alex" -> "npc").
 * @see compositionPackageStore.namespaceToRole for runtime API
 */
export const NAMESPACE_TO_COMPOSITION_ROLE = ${JSON.stringify(namespaceMappings, null, 2)} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Priority order for role selection (highest first).
 * When multiple tags map to different roles, pick the highest priority.
 * @see compositionPackageStore.priority for runtime API
 */
export const COMPOSITION_ROLE_PRIORITY = ${JSON.stringify(priority)} as const satisfies readonly ImageCompositionRole[];

/**
 * Group role IDs (top-level categories, not assignable to assets).
 */
export const ROLE_GROUPS = ${JSON.stringify(roleGroups)} as const;

/**
 * Leaf role IDs (assignable to assets).
 */
export const LEAF_COMPOSITION_ROLES = ${JSON.stringify(leafRoles)} as const;

/**
 * Leaf role → parent group mapping.
 * e.g. "entities:main_character" → "entities"
 */
export const ROLE_PARENTS = ${JSON.stringify(roleParents, null, 2)} as const satisfies Partial<Record<ImageCompositionRole, string>>;

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
`;

// Check mode: compare with existing file
if (CHECK_MODE) {
  if (!fs.existsSync(OUT_PATH)) {
    console.error(`✗ Generated file missing: ${OUT_PATH}`);
    console.error('  Run: pnpm composition-roles:gen');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUT_PATH, 'utf8');
  if (existing !== output) {
    console.error(`✗ Generated file out of date: ${OUT_PATH}`);
    console.error('  Run: pnpm composition-roles:gen');
    process.exit(1);
  }
  console.log(`✓ Generated file is current: ${OUT_PATH}`);
  process.exit(0);
}

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

// Write output
fs.writeFileSync(OUT_PATH, output, 'utf8');
console.log(`✓ Generated: ${OUT_PATH}`);

function normalizeRoleId(value: string): string {
  return value.startsWith('role:') ? value.slice(5) : value;
}
