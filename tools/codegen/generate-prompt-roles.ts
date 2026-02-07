#!/usr/bin/env tsx
/**
 * Generates TypeScript constants from prompt roles vocabulary
 *
 * Source:  pixsim7/backend/main/plugins/starter_pack/vocabularies/prompt_roles.yaml
 * Output:  packages/shared/types/src/prompt-roles.generated.ts
 *
 * Usage:
 *   pnpm prompt-roles:gen       # Generate types
 *   pnpm prompt-roles:check     # Verify generated file is current (CI)
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

const PROMPT_YAML_PATH = path.resolve(
  normalizedDir,
  '../../pixsim7/backend/main/plugins/starter_pack/vocabularies/prompt_roles.yaml'
);
const COMPOSITION_YAML_PATH = path.resolve(
  normalizedDir,
  '../../pixsim7/backend/main/plugins/starter_pack/vocabularies/roles.yaml'
);
const OUT_PATH = path.resolve(
  normalizedDir,
  '../../packages/shared/types/src/prompt-roles.generated.ts'
);

// Validate YAML file exists
if (!fs.existsSync(PROMPT_YAML_PATH)) {
  console.error(`✗ Missing prompt roles data: ${PROMPT_YAML_PATH}`);
  console.error('  Ensure pixsim7/backend/main/plugins/starter_pack/vocabularies/prompt_roles.yaml exists.');
  process.exit(1);
}

// Parse YAML
let promptData: Record<string, unknown>;
try {
  promptData = yaml.parse(fs.readFileSync(PROMPT_YAML_PATH, 'utf8'));
} catch (err) {
  console.error(`✗ Failed to parse ${PROMPT_YAML_PATH}:`);
  console.error(`  ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

// Validate required keys
if (!('roles' in promptData)) {
  console.error(`✗ Missing required key in ${PROMPT_YAML_PATH}: roles`);
  process.exit(1);
}

const promptRolesData = promptData.roles as Record<string, Record<string, unknown>>;

// Optional: load composition roles for inheritance (colors/labels/desc)
let compositionRoles: Record<string, { label?: string; description?: string; color?: string }> = {};
if (fs.existsSync(COMPOSITION_YAML_PATH)) {
  try {
    const compositionData = yaml.parse(fs.readFileSync(COMPOSITION_YAML_PATH, 'utf8')) as Record<string, unknown>;
    const rawRoles = (compositionData.roles ?? {}) as Record<string, { label?: string; description?: string; color?: string }>;
    compositionRoles = Object.fromEntries(
      Object.entries(rawRoles).map(([key, value]) => [
        normalizeCompositionRoleId(key),
        {
          label: value?.label,
          description: value?.description,
          color: value?.color,
        },
      ])
    );
  } catch (err) {
    console.error(`✗ Failed to parse ${COMPOSITION_YAML_PATH}:`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const roleIds = Object.keys(promptRolesData).map((roleId) => normalizePromptRoleId(roleId));

const labels: Record<string, string> = {};
const descriptions: Record<string, string> = {};
const priorities: Record<string, number> = {};
const aliases: Record<string, string[]> = {};
const compositionMappings: Record<string, string> = {};
const colors: Record<string, string> = {};

for (const [rawRoleId, data] of Object.entries(promptRolesData)) {
  const roleId = normalizePromptRoleId(rawRoleId);
  const label = getString(data.label);
  const description = getString(data.description);
  const priority = getNumber(data.priority, 0);
  const roleAliases = toStringArray(data.aliases);
  const compositionRole = getString(data.composition_role ?? data.compositionRole);

  let normalizedComposition: string | undefined;
  if (compositionRole) {
    normalizedComposition = normalizeCompositionRoleId(compositionRole);
    compositionMappings[roleId] = normalizedComposition;
  }

  const composition = normalizedComposition ? compositionRoles[normalizedComposition] : undefined;

  labels[roleId] = label || composition?.label || toTitle(roleId);
  descriptions[roleId] = description || composition?.description || '';
  priorities[roleId] = priority;
  aliases[roleId] = roleAliases.map((alias) => alias.toLowerCase());

  const explicitColor = getString(data.color);
  colors[roleId] = explicitColor || composition?.color || 'gray';
}

const priorityOrder = [...roleIds].sort((a, b) => {
  const diff = (priorities[b] ?? 0) - (priorities[a] ?? 0);
  if (diff !== 0) return diff;
  return a.localeCompare(b);
});

const output = `// Auto-generated from prompt roles vocabulary - DO NOT EDIT
// Re-run: pnpm prompt-roles:gen
//
// Source: pixsim7/backend/main/plugins/starter_pack/vocabularies/prompt_roles.yaml

export const PROMPT_ROLES = ${JSON.stringify(roleIds)} as const;

/**
 * Core prompt role type, derived from vocab.
 * Only includes core roles - not plugin-contributed ones.
 */
export type PromptRoleId = typeof PROMPT_ROLES[number];

/**
 * Flexible prompt role ID type that includes core + plugin roles.
 */
export type PromptRole = PromptRoleId | (string & {});

/**
 * Role labels for UI display.
 */
export const PROMPT_ROLE_LABELS = ${JSON.stringify(labels, null, 2)} as const satisfies Record<PromptRoleId, string>;

/**
 * Role descriptions for UI display.
 */
export const PROMPT_ROLE_DESCRIPTIONS = ${JSON.stringify(descriptions, null, 2)} as const satisfies Record<PromptRoleId, string>;

/**
 * Role priority map (higher = more important).
 */
export const PROMPT_ROLE_PRIORITIES = ${JSON.stringify(priorities, null, 2)} as const satisfies Record<PromptRoleId, number>;

/**
 * Priority order for prompt roles (highest first).
 */
export const PROMPT_ROLE_PRIORITY = ${JSON.stringify(priorityOrder)} as const satisfies readonly PromptRoleId[];

/**
 * Role aliases (lowercased).
 */
export const PROMPT_ROLE_ALIASES = ${JSON.stringify(aliases, null, 2)} as const satisfies Record<PromptRoleId, readonly string[]>;

/**
 * Prompt role -> composition role mapping.
 * Composition role IDs are normalized (no "role:" prefix).
 */
export const PROMPT_ROLE_TO_COMPOSITION_ROLE = ${JSON.stringify(compositionMappings, null, 2)} as const satisfies Partial<Record<PromptRoleId, string>>;

/**
 * Prompt role color names.
 * Derived from prompt roles vocab (or composition role color if inherited).
 */
export const PROMPT_ROLE_COLORS = ${JSON.stringify(colors, null, 2)} as const satisfies Record<PromptRoleId, string>;
`;

if (CHECK_MODE) {
  if (!fs.existsSync(OUT_PATH)) {
    console.error(`✗ Generated file missing: ${OUT_PATH}`);
    console.error('  Run: pnpm prompt-roles:gen');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUT_PATH, 'utf8');
  if (existing !== output) {
    console.error(`✗ Generated file out of date: ${OUT_PATH}`);
    console.error('  Run: pnpm prompt-roles:gen');
    process.exit(1);
  }
  console.log(`✓ Generated file is current: ${OUT_PATH}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, output, 'utf8');
console.log(`✓ Generated: ${OUT_PATH}`);

function normalizePromptRoleId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('prompt_role:')) return trimmed.slice('prompt_role:'.length);
  if (trimmed.startsWith('role:')) return trimmed.slice('role:'.length);
  return trimmed;
}

function normalizeCompositionRoleId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('role:')) return trimmed.slice('role:'.length);
  return trimmed;
}

function toTitle(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}
