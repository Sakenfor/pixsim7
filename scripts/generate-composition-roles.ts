#!/usr/bin/env tsx
/**
 * Generates TypeScript constants from composition-roles.yaml
 *
 * Source:  pixsim7/backend/main/shared/composition-roles.yaml (single source of truth)
 * Output:  packages/shared/types/src/composition-roles.generated.ts
 *
 * Usage:
 *   pnpm composition-roles:gen       # Generate types
 *   pnpm composition-roles:check     # Verify generated file is current (CI)
 *
 * This script is run during prebuild to ensure the generated file
 * is always present and current for CI/clean installs.
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

const YAML_PATH = path.resolve(normalizedDir, '../pixsim7/backend/main/shared/composition-roles.yaml');
const OUT_PATH = path.resolve(normalizedDir, '../packages/shared/types/src/composition-roles.generated.ts');

// Validate YAML file exists
if (!fs.existsSync(YAML_PATH)) {
  console.error(`✗ Missing composition roles data: ${YAML_PATH}`);
  console.error('  Ensure pixsim7/backend/main/shared/composition-roles.yaml exists.');
  process.exit(1);
}

// Parse YAML
let data: Record<string, unknown>;
try {
  data = yaml.parse(fs.readFileSync(YAML_PATH, 'utf8'));
} catch (err) {
  console.error(`✗ Failed to parse ${YAML_PATH}:`);
  console.error(`  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

// Validate required keys
const required = ['roles', 'priority', 'slugMappings', 'namespaceMappings'];
const missing = required.filter((k) => !(k in data));
if (missing.length > 0) {
  console.error(`✗ Missing required keys in ${YAML_PATH}: ${missing.join(', ')}`);
  process.exit(1);
}

// Extract and normalize mappings (lowercase keys for consistency)
const slugMappings = Object.fromEntries(
  Object.entries(data.slugMappings as Record<string, string>).map(([k, v]) => [
    k.toLowerCase(),
    v,
  ])
);
const namespaceMappings = Object.fromEntries(
  Object.entries(data.namespaceMappings as Record<string, string>).map(([k, v]) => [
    k.toLowerCase(),
    v,
  ])
);
const priority = data.priority as string[];

// Extract roles - now an object with metadata
const rolesData = data.roles as Record<string, {
  description: string;
  color: string;
  defaultLayer?: number;
  tags?: string[];
}>;
const roles = Object.keys(rolesData);
const descriptions = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [k, v.description])
);
const colors = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [k, v.color])
);
const defaultLayers = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [k, v.defaultLayer ?? 0])
);
const roleTags = Object.fromEntries(
  Object.entries(rolesData).map(([k, v]) => [k, v.tags ?? []])
);

// Generate TypeScript output
const output = `// Auto-generated from composition-roles.yaml - DO NOT EDIT
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
export const COMPOSITION_ROLES = ${JSON.stringify(roles)} as const;

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
export const ROLE_DESCRIPTIONS = ${JSON.stringify(descriptions, null, 2)} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Role colors (tailwind color names) for badges/UI.
 * @deprecated Use compositionPackageStore.getRoleColor() instead.
 */
export const ROLE_COLORS = ${JSON.stringify(colors, null, 2)} as const satisfies Record<ImageCompositionRole, string>;

/**
 * Default layer order per role (0=background, higher=foreground).
 * @deprecated Use role.default_layer from compositionPackageStore.roles instead.
 */
export const ROLE_DEFAULT_LAYERS = ${JSON.stringify(defaultLayers, null, 2)} as const satisfies Record<ImageCompositionRole, number>;

/**
 * Role tags for filtering and asset matching.
 * @deprecated Use role.tags from compositionPackageStore.roles instead.
 */
export const ROLE_TAGS = ${JSON.stringify(roleTags, null, 2)} as const satisfies Record<ImageCompositionRole, readonly string[]>;

/**
 * Tag slug -> composition role mapping.
 * Exact match lookup (e.g., "bg", "char:hero").
 * @deprecated Use compositionPackageStore.slugToRole instead.
 */
export const SLUG_TO_COMPOSITION_ROLE = ${JSON.stringify(slugMappings, null, 2)} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Tag namespace -> composition role mapping.
 * Used after extracting prefix before ":" (e.g., "npc:alex" -> "npc").
 * @deprecated Use compositionPackageStore.namespaceToRole instead.
 */
export const NAMESPACE_TO_COMPOSITION_ROLE = ${JSON.stringify(namespaceMappings, null, 2)} as const satisfies Record<string, ImageCompositionRole>;

/**
 * Priority order for role selection (highest first).
 * When multiple tags map to different roles, pick the highest priority.
 * @deprecated Use compositionPackageStore.priority instead.
 */
export const COMPOSITION_ROLE_PRIORITY = ${JSON.stringify(priority)} as const satisfies readonly ImageCompositionRole[];

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
