/**
 * Project Manifest & Health
 *
 * Aggregates entity completeness into a project-level view.
 * A "project" is conceptually one world — the manifest describes
 * what content it contains and how ready it is for play.
 */

import type {
  AggregateCompleteness,
  EntityCompleteness,
  NpcAuthoringInput,
  LocationAuthoringInput,
  SceneAuthoringInput,
  CompletenessCheck,
} from './types';
import { checkNpcBatchCompleteness } from './npcCompleteness';
import { checkLocationBatchCompleteness } from './locationCompleteness';
import { checkSceneBatchCompleteness } from './sceneCompleteness';

// ---------------------------------------------------------------------------
// Manifest type
// ---------------------------------------------------------------------------

/** High-level content inventory for a project/world. */
export interface ProjectManifest {
  /** World / project identifier (optional — content can be worldless) */
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

  /** Per-entity detail (optional — can be large) */
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
}

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

/**
 * Cross-entity checks that look at relationships between NPCs, locations,
 * and scenes rather than individual entity readiness.
 */
function runCrossChecks(
  npcs: NpcAuthoringInput[],
  locations: LocationAuthoringInput[],
  _scenes: SceneAuthoringInput[],
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
    status: _scenes.length > 0 ? 'complete' : 'incomplete',
    detail: _scenes.length === 0 ? 'Add a scene with dialogue or narrative content' : undefined,
  });

  return checks;
}

/**
 * Build a full project manifest from raw content data.
 *
 * This is the main entry point — pass in all your NPCs, locations, and scenes
 * and get back a comprehensive health report.
 */
export function buildProjectManifest(input: ProjectManifestInput): ProjectManifest {
  const npcResults = checkNpcBatchCompleteness(input.npcs);
  const locationResults = checkLocationBatchCompleteness(input.locations);
  const sceneResults = checkSceneBatchCompleteness(input.scenes);

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
 * Compute a single 0–1 readiness score for the whole project.
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
