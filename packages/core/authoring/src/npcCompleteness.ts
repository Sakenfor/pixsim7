/**
 * NPC Completeness Checks
 *
 * Evaluates how "ready for play" an NPC is by checking for required
 * authoring data: expressions, schedule, preferences, portrait, etc.
 */

import type {
  CompletenessCheck,
  EntityCompleteness,
  NpcAuthoringInput,
} from './types';

function check(
  id: string,
  label: string,
  passes: boolean,
  detail?: string,
): CompletenessCheck {
  return {
    id,
    label,
    status: passes ? 'complete' : 'incomplete',
    detail: passes ? undefined : detail,
  };
}

function warn(
  id: string,
  label: string,
  detail: string,
): CompletenessCheck {
  return { id, label, status: 'warning', detail };
}

/**
 * Run all completeness checks for a single NPC.
 */
export function checkNpcCompleteness(npc: NpcAuthoringInput): EntityCompleteness {
  const checks: CompletenessCheck[] = [];
  const meta = (npc.meta ?? {}) as Record<string, unknown>;

  // --- Identity ---
  checks.push(
    check('npc.hasName', 'Has a name', npc.name.trim().length > 0, 'NPC needs a name'),
  );

  // --- Portrait ---
  checks.push(
    check(
      'npc.hasPortrait',
      'Has a portrait asset',
      npc.portraitAssetId != null,
      'Assign a portrait image so the NPC has a visual identity',
    ),
  );

  // --- Expressions ---
  const expCount = npc.expressions?.length ?? 0;
  checks.push(
    check(
      'npc.hasExpressions',
      'Has expression states',
      expCount > 0,
      'Add at least one expression state (e.g. idle) for conversation display',
    ),
  );
  if (expCount > 0) {
    const hasIdle = npc.expressions!.some((e) => e.state === 'idle');
    if (!hasIdle) {
      checks.push(
        warn('npc.missingIdle', 'Missing idle expression', 'An idle expression is recommended as fallback'),
      );
    }
  }

  // --- Schedule / Routine ---
  const hasScheduleEntries = (npc.scheduleEntries?.length ?? 0) > 0;
  const hasRoutineGraph = (npc.routineNodes?.length ?? 0) > 0;
  checks.push(
    check(
      'npc.hasSchedule',
      'Has a schedule or routine',
      hasScheduleEntries || hasRoutineGraph,
      'Define a daily schedule or routine graph so the NPC appears in locations',
    ),
  );

  // --- Home location ---
  checks.push(
    check(
      'npc.hasHomeLocation',
      'Has a home location',
      npc.homeLocationId != null,
      'Assign a home location for fallback placement',
    ),
  );

  // --- Preferences ---
  const prefs = meta.preferences as Record<string, unknown> | undefined;
  const hasActivityWeights =
    prefs != null && typeof prefs === 'object' &&
    Object.keys(prefs.activityWeights as Record<string, unknown> ?? {}).length > 0;
  const hasTraitModifiers =
    prefs != null && typeof prefs === 'object' &&
    Object.keys(prefs.traitModifiers as Record<string, unknown> ?? {}).length > 0;
  checks.push(
    check(
      'npc.hasPreferences',
      'Has behavior preferences',
      hasActivityWeights || hasTraitModifiers,
      'Set activity weights or trait modifiers for richer autonomous behavior',
    ),
  );

  // --- Personality / Brain traits ---
  const brain = meta.brain as Record<string, unknown> | undefined;
  const personality = meta.personality as Record<string, unknown> | undefined;
  const hasBrainTraits =
    (brain != null && typeof brain === 'object' && Object.keys(brain).length > 0) ||
    (personality != null && typeof personality === 'object' && Object.keys(personality).length > 0);
  checks.push(
    check(
      'npc.hasPersonality',
      'Has personality or brain traits',
      hasBrainTraits,
      'Define personality traits so the NPC has a distinct character',
    ),
  );

  const passed = checks.filter((c) => c.status === 'complete').length;
  const total = checks.length;

  return {
    entityType: 'npc',
    entityId: npc.id,
    entityName: npc.name,
    checks,
    score: total === 0 ? 1 : passed / total,
  };
}

/**
 * Run completeness checks for a batch of NPCs.
 */
export function checkNpcBatchCompleteness(npcs: NpcAuthoringInput[]): EntityCompleteness[] {
  return npcs.map(checkNpcCompleteness);
}
