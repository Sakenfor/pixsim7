#!/usr/bin/env tsx
/**
 * Generates TypeScript constants for region label suggestions.
 *
 * Sources:
 *   - pixsim7/backend/main/shared/composition-roles.yaml (composition roles)
 *   - pixsim7/backend/main/domain/ontology/data/ontology.yaml (anatomy parts, regions, poses)
 *
 * Output:  packages/shared/types/src/region-labels.generated.ts
 *
 * Usage:
 *   pnpm region-labels:gen       # Generate types
 *   pnpm region-labels:check     # Verify generated file is current (CI)
 *
 * This provides autocomplete suggestions for region labels in the media viewer,
 * reusing existing vocabularies rather than creating new canonical lists.
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

const COMPOSITION_ROLES_PATH = path.resolve(normalizedDir, '../pixsim7/backend/main/shared/composition-roles.yaml');
const ONTOLOGY_PATH = path.resolve(normalizedDir, '../pixsim7/backend/main/domain/ontology/data/ontology.yaml');
const OUT_PATH = path.resolve(normalizedDir, '../packages/shared/types/src/region-labels.generated.ts');

// ============================================================================
// Load YAML Files
// ============================================================================

function loadYaml(filePath: string, name: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    console.error(`\u2717 Missing ${name}: ${filePath}`);
    process.exit(1);
  }
  try {
    return yaml.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`\u2717 Failed to parse ${filePath}:`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const compositionData = loadYaml(COMPOSITION_ROLES_PATH, 'composition-roles.yaml');
const ontologyData = loadYaml(ONTOLOGY_PATH, 'ontology.yaml');

// ============================================================================
// Extract Labels
// ============================================================================

interface LabelSuggestion {
  id: string;
  label: string;
  group: 'builtin' | 'role' | 'part' | 'region' | 'pose';
}

// Built-in influence_region values (no mask: prefix needed)
const builtinLabels: LabelSuggestion[] = [
  { id: 'foreground', label: 'Foreground', group: 'builtin' },
  { id: 'background', label: 'Background', group: 'builtin' },
  { id: 'full', label: 'Full Image', group: 'builtin' },
  { id: 'subject', label: 'Subject', group: 'builtin' },
];

// Extract composition roles
const rolesData = compositionData.roles as Record<string, { description: string; color: string }>;
const compositionRoleLabels: LabelSuggestion[] = Object.entries(rolesData).map(([id, meta]) => ({
  id,
  label: meta.description.split(' ')[0] + (meta.description.includes('/') ? '' : ''), // Short label
  group: 'role' as const,
}));

// Better labels for roles
const roleLabelOverrides: Record<string, string> = {
  main_character: 'Character',
  companion: 'Companion',
  environment: 'Environment',
  prop: 'Prop',
  style_reference: 'Style Reference',
  effect: 'Effect',
};
for (const item of compositionRoleLabels) {
  if (roleLabelOverrides[item.id]) {
    item.label = roleLabelOverrides[item.id];
  }
}

// Extract from ontology - domain packs
const domainPacks = (ontologyData.domain as { packs?: Record<string, unknown> })?.packs ?? {};

function extractOntologyItems(
  pack: Record<string, unknown>,
  key: string,
  group: LabelSuggestion['group']
): LabelSuggestion[] {
  const items = pack[key] as Array<{ id: string; label: string }> | undefined;
  if (!items) return [];
  return items.map((item) => {
    // Strip prefix like "part:", "region:" from id for cleaner labels
    const cleanId = item.id.includes(':') ? item.id.split(':')[1] : item.id;
    return {
      id: cleanId,
      label: item.label,
      group,
    };
  });
}

// Collect anatomy parts and regions from all packs
const anatomyPartLabels: LabelSuggestion[] = [];
const anatomyRegionLabels: LabelSuggestion[] = [];

for (const pack of Object.values(domainPacks) as Record<string, unknown>[]) {
  anatomyPartLabels.push(...extractOntologyItems(pack, 'anatomy_parts', 'part'));
  anatomyRegionLabels.push(...extractOntologyItems(pack, 'anatomy_regions', 'region'));
}

// Extract poses from action_blocks section
const actionBlocks = ontologyData.action_blocks as { poses?: { definitions?: Array<{ id: string; label: string }> } } | undefined;
const poseDefinitions = actionBlocks?.poses?.definitions ?? [];
const poseLabels: LabelSuggestion[] = poseDefinitions.map((pose) => {
  const cleanId = pose.id.includes(':') ? pose.id.split(':')[1] : pose.id;
  return {
    id: cleanId,
    label: pose.label,
    group: 'pose' as const,
  };
});

// Add common labels that might not be in ontology but are useful for composition
const commonExtraLabels: LabelSuggestion[] = [
  { id: 'face', label: 'Face', group: 'part' },
  { id: 'pose', label: 'Pose', group: 'pose' },
  { id: 'outfit', label: 'Outfit', group: 'part' },
  { id: 'clothes', label: 'Clothes', group: 'part' },
  { id: 'hair', label: 'Hair', group: 'part' },
  { id: 'expression', label: 'Expression', group: 'part' },
  { id: 'body', label: 'Body', group: 'part' },
  { id: 'upper_body', label: 'Upper Body', group: 'region' },
  { id: 'lower_body', label: 'Lower Body', group: 'region' },
];

// Deduplicate by id (prefer existing over extras)
const seenIds = new Set<string>();
function dedupeAndCollect(items: LabelSuggestion[], target: LabelSuggestion[]): void {
  for (const item of items) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      target.push(item);
    }
  }
}

const allLabels: LabelSuggestion[] = [];
dedupeAndCollect(builtinLabels, allLabels);
dedupeAndCollect(compositionRoleLabels, allLabels);
dedupeAndCollect(anatomyPartLabels, allLabels);
dedupeAndCollect(anatomyRegionLabels, allLabels);
dedupeAndCollect(poseLabels, allLabels);
dedupeAndCollect(commonExtraLabels, allLabels);

// ============================================================================
// Generate Output
// ============================================================================

const output = `// Auto-generated from composition-roles.yaml + ontology.yaml - DO NOT EDIT
// Re-run: pnpm region-labels:gen
//
// ========================================================================
// NOTE: For dynamic/plugin-aware data, prefer the runtime API:
//   - useConceptStore (apps/main/src/stores/conceptStore.ts)
//   - Fetches from /api/v1/concepts/{kind} at runtime
//
// This file provides:
//   - Type definitions (LabelSuggestion) - always valid
//   - Static fallback data when API unavailable
//   - Pure utility functions (labelToInfluenceRegion)
// ========================================================================

/**
 * Label suggestion for region annotation autocomplete.
 */
export interface LabelSuggestion {
  /** Label ID (used as region label value) */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Category for grouping in UI */
  group: 'builtin' | 'role' | 'part' | 'region' | 'pose';
}

/**
 * Built-in influence_region values (no mask: prefix needed).
 * @see useConceptStore.getByKind('influence_region') for runtime API
 */
export const BUILTIN_REGION_LABELS: LabelSuggestion[] = ${JSON.stringify(builtinLabels, null, 2)};

/**
 * Composition role labels (from composition-roles.yaml).
 * @see useConceptStore.getByKind('role') for runtime API
 */
export const COMPOSITION_ROLE_LABELS: LabelSuggestion[] = ${JSON.stringify(compositionRoleLabels, null, 2)};

/**
 * Anatomy part labels (from ontology.yaml).
 * @see useConceptStore.getByKind('part') for runtime API
 */
export const ANATOMY_PART_LABELS: LabelSuggestion[] = ${JSON.stringify(anatomyPartLabels, null, 2)};

/**
 * Anatomy region labels (from ontology.yaml).
 * @see useConceptStore.getByKind('body_region') for runtime API
 */
export const ANATOMY_REGION_LABELS: LabelSuggestion[] = ${JSON.stringify(anatomyRegionLabels, null, 2)};

/**
 * Pose labels (from ontology.yaml action_blocks).
 * @see useConceptStore.getByKind('pose') for runtime API
 */
export const POSE_LABELS: LabelSuggestion[] = ${JSON.stringify(poseLabels, null, 2)};

/**
 * All region label suggestions combined and deduplicated.
 * @see useLabelsForAutocomplete() hook for runtime API
 */
export const ALL_REGION_LABELS: LabelSuggestion[] = ${JSON.stringify(allLabels, null, 2)};

/**
 * Group display names for UI.
 * Note: Group names are also included in ConceptResponse.group from the API.
 */
export const LABEL_GROUP_NAMES: Record<LabelSuggestion['group'], string> = {
  builtin: 'Built-in Regions',
  role: 'Composition Roles',
  part: 'Anatomy Parts',
  region: 'Body Regions',
  pose: 'Poses',
};

/**
 * Get labels by group.
 * @see useConceptStore.getByKind(kind) for runtime API
 */
export function getLabelsByGroup(group: LabelSuggestion['group']): LabelSuggestion[] {
  return ALL_REGION_LABELS.filter((l) => l.group === group);
}

/**
 * Check if a label is a built-in region (doesn't need mask: prefix).
 * @see useConceptStore.getByKind('influence_region') for runtime API
 */
export function isBuiltinRegion(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  return BUILTIN_REGION_LABELS.some((l) => l.id === normalized);
}

/**
 * Map a region label to influence_region format.
 *
 * - Built-in labels (foreground, background, full, subject) -> used as-is
 * - Subject with number (subject_1, subject:1) -> "subject:N"
 * - Everything else -> "mask:<label>"
 */
export function labelToInfluenceRegion(label: string): string {
  const normalized = label.toLowerCase().trim();

  // Built-in regions (no prefix)
  if (normalized === 'foreground') return 'foreground';
  if (normalized === 'background') return 'background';
  if (normalized === 'full') return 'full';

  // Subject with optional index
  if (normalized === 'subject') return 'subject:0';
  const subjectMatch = normalized.match(/^subject[_:]?(\\d+)$/);
  if (subjectMatch) return \`subject:\${subjectMatch[1]}\`;

  // Everything else becomes mask:<label>
  return \`mask:\${normalized}\`;
}
`;

// ============================================================================
// Check or Write
// ============================================================================

if (CHECK_MODE) {
  if (!fs.existsSync(OUT_PATH)) {
    console.error(`\u2717 Generated file missing: ${OUT_PATH}`);
    console.error('  Run: pnpm region-labels:gen');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUT_PATH, 'utf8');
  if (existing !== output) {
    console.error(`\u2717 Generated file out of date: ${OUT_PATH}`);
    console.error('  Run: pnpm region-labels:gen');
    process.exit(1);
  }
  console.log(`\u2713 Generated file is current: ${OUT_PATH}`);
  process.exit(0);
}

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

// Write output
fs.writeFileSync(OUT_PATH, output, 'utf8');
console.log(`\u2713 Generated: ${OUT_PATH}`);
