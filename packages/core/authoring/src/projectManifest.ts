/**
 * Project Manifest and Health
 *
 * Aggregates entity completeness into a project-level view.
 * A "project" is conceptually one world - the manifest describes
 * what content it contains and how ready it is for play.
 *
 * Entity checks come from schemas (`npcSchema`, `locationSchema`, `sceneSchema`).
 * Cross-entity checks live here because they span multiple entity types.
 */

import type {
  AggregateCompleteness,
  EntityCompleteness,
  NpcAuthoringInput,
  LocationAuthoringInput,
  SceneAuthoringInput,
  CompletenessCheck,
} from './types';
import type { EntitySchema } from './entitySchema';
import { npcSchema } from './npcCompleteness';
import { locationSchema } from './locationCompleteness';
import { sceneSchema } from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Manifest type
// ---------------------------------------------------------------------------

/** High-level content inventory for a project/world. */
export interface ProjectManifest {
  /** World / project identifier (optional - content can be worldless) */
  worldId?: number | string | null;
  worldName?: string;

  counts: {
    npcs: number;
    locations: number;
    scenes: number;
    hotspots: number;
  };

  npcCompleteness: AggregateCompleteness;
  locationCompleteness: AggregateCompleteness;
  sceneCompleteness: AggregateCompleteness;

  /** Cross-entity structural checks (e.g. NPCs reference valid locations) */
  crossChecks: CompletenessCheck[];

  /** Per-entity detail (optional - can be large) */
  entities?: {
    npcs: EntityCompleteness[];
    locations: EntityCompleteness[];
    scenes: EntityCompleteness[];
  };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface ProjectManifestInput {
  worldId?: number | string | null;
  worldName?: string;
  npcs: NpcAuthoringInput[];
  locations: LocationAuthoringInput[];
  scenes: SceneAuthoringInput[];
  /** Set to true to include per-entity detail in the manifest */
  includeEntityDetail?: boolean;
  /** Optional NPC schema override (useful for per-call feature composition). */
  npcSchema?: EntitySchema<NpcAuthoringInput>;
  /** Optional location schema override (useful for per-call feature composition). */
  locationSchema?: EntitySchema<LocationAuthoringInput>;
  /** Optional scene schema override (useful for per-call feature composition). */
  sceneSchema?: EntitySchema<SceneAuthoringInput>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function aggregate(results: EntityCompleteness[]): AggregateCompleteness {
  const total = results.length;
  if (total === 0) {
    return { totalEntities: 0, fullyComplete: 0, incomplete: 0, averageScore: 1 };
  }
  const fullyComplete = results.filter((r) => r.score === 1).length;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / total;
  return {
    totalEntities: total,
    fullyComplete,
    incomplete: total - fullyComplete,
    averageScore: Math.round(avgScore * 100) / 100,
  };
}

/** Run a checker function against every item and collect results. */
function runBatch<T extends { id: number | string }>(
  checker: (item: T) => CompletenessCheck[],
  entityType: 'npc' | 'location' | 'scene',
  items: T[],
  nameAccessor: (item: T) => string,
): EntityCompleteness[] {
  return items.map((item) => {
    const checks = checker(item);
    const passed = checks.filter((c) => c.status === 'complete').length;
    const total = checks.length;
    return {
      entityType,
      entityId: item.id,
      entityName: nameAccessor(item),
      checks,
      score: total === 0 ? 1 : passed / total,
    };
  });
}

/**
 * Cross-entity checks that look at relationships between NPCs, locations,
 * and scenes rather than individual entity readiness.
 */
function runCrossChecks(
  npcs: NpcAuthoringInput[],
  locations: LocationAuthoringInput[],
  scenes: SceneAuthoringInput[],
): CompletenessCheck[] {
  const checks: CompletenessCheck[] = [];
  const locationIds = new Set(locations.map((l) => String(l.id)));

  // NPC home locations should reference existing locations
  const orphanedNpcs = npcs.filter(
    (n) => n.homeLocationId != null && !locationIds.has(String(n.homeLocationId)),
  );
  if (orphanedNpcs.length > 0) {
    checks.push({
      id: 'cross.npcHomeLocationExists',
      label: 'NPC home locations valid',
      status: 'warning',
      detail: `${orphanedNpcs.length} NPC(s) reference a home location that doesn't exist in this project`,
    });
  } else if (npcs.some((n) => n.homeLocationId != null)) {
    checks.push({
      id: 'cross.npcHomeLocationExists',
      label: 'NPC home locations valid',
      status: 'complete',
    });
  }

  // Every location with a change_location hotspot should point to a known location
  const allNavTargets: Array<{ locName: string; targetId: string }> = [];
  for (const loc of locations) {
    for (const h of loc.hotspots ?? []) {
      if (h.action?.type === 'change_location') {
        const targetId = String(
          (h.action as Record<string, unknown>).target_location_id ?? '',
        );
        if (targetId && !locationIds.has(targetId)) {
          allNavTargets.push({ locName: loc.name, targetId });
        }
      }
    }
  }
  if (allNavTargets.length > 0) {
    checks.push({
      id: 'cross.navTargetsExist',
      label: 'Navigation targets valid',
      status: 'warning',
      detail: `${allNavTargets.length} navigation hotspot(s) reference locations not in this project`,
    });
  } else if (locations.length > 1) {
    checks.push({
      id: 'cross.navTargetsExist',
      label: 'Navigation targets valid',
      status: 'complete',
    });
  }

  // Minimum content checks
  checks.push({
    id: 'cross.hasLocations',
    label: 'Has at least one location',
    status: locations.length > 0 ? 'complete' : 'incomplete',
    detail: locations.length === 0 ? 'Add a location for players to explore' : undefined,
  });
  checks.push({
    id: 'cross.hasNpcs',
    label: 'Has at least one NPC',
    status: npcs.length > 0 ? 'complete' : 'incomplete',
    detail: npcs.length === 0 ? 'Add an NPC for players to interact with' : undefined,
  });
  checks.push({
    id: 'cross.hasScenes',
    label: 'Has at least one scene',
    status: scenes.length > 0 ? 'complete' : 'incomplete',
    detail: scenes.length === 0 ? 'Add a scene with dialogue or narrative content' : undefined,
  });

  return checks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a full project manifest from raw content data.
 *
 * Uses entity schemas directly.
 */
export function buildProjectManifest(input: ProjectManifestInput): ProjectManifest {
  const resolvedNpcSchema = input.npcSchema ?? npcSchema;
  const resolvedLocationSchema = input.locationSchema ?? locationSchema;
  const resolvedSceneSchema = input.sceneSchema ?? sceneSchema;

  const npcResults = runBatch(
    (npc) => resolvedNpcSchema.check(npc),
    'npc',
    input.npcs,
    (n) => n.name,
  );

  const locationResults = runBatch(
    (loc) => resolvedLocationSchema.check(loc),
    'location',
    input.locations,
    (l) => l.name,
  );

  const sceneResults = runBatch(
    (scene) => resolvedSceneSchema.check(scene),
    'scene',
    input.scenes,
    (scene) => scene.title,
  );

  const totalHotspots = input.locations.reduce(
    (sum, l) => sum + (l.hotspots?.length ?? 0),
    0,
  );

  return {
    worldId: input.worldId,
    worldName: input.worldName,
    counts: {
      npcs: input.npcs.length,
      locations: input.locations.length,
      scenes: input.scenes.length,
      hotspots: totalHotspots,
    },
    npcCompleteness: aggregate(npcResults),
    locationCompleteness: aggregate(locationResults),
    sceneCompleteness: aggregate(sceneResults),
    crossChecks: runCrossChecks(input.npcs, input.locations, input.scenes),
    entities: input.includeEntityDetail
      ? { npcs: npcResults, locations: locationResults, scenes: sceneResults }
      : undefined,
  };
}

/**
 * Compute a single 0-1 readiness score for the whole project.
 *
 * Weights: entity completeness (60%), cross-checks (40%).
 */
export function computeProjectReadiness(manifest: ProjectManifest): number {
  const entityScores = [
    manifest.npcCompleteness.averageScore,
    manifest.locationCompleteness.averageScore,
    manifest.sceneCompleteness.averageScore,
  ];
  // Only count categories that have entities
  const nonEmpty = entityScores.filter((_, i) => {
    const counts = [
      manifest.counts.npcs,
      manifest.counts.locations,
      manifest.counts.scenes,
    ];
    return counts[i] > 0;
  });
  const entityAvg =
    nonEmpty.length > 0
      ? nonEmpty.reduce((a, b) => a + b, 0) / nonEmpty.length
      : 0;

  const crossTotal = manifest.crossChecks.length;
  const crossPassed = manifest.crossChecks.filter((c) => c.status === 'complete').length;
  const crossScore = crossTotal > 0 ? crossPassed / crossTotal : 1;

  return Math.round((entityAvg * 0.6 + crossScore * 0.4) * 100) / 100;
}
