/**
 * NPC Completeness Checks — Built-in providers
 *
 * Each provider is a standalone function that inspects one aspect of an NPC.
 * `registerBuiltinNpcChecks` adds them all to a registry.
 * Features can register additional providers or replace built-ins.
 */

import type { CompletenessCheck, NpcAuthoringInput } from './types';
import type { CheckProvider, CompletenessRegistry } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Individual providers
// ---------------------------------------------------------------------------

export const checkNpcIdentity: CheckProvider<NpcAuthoringInput> = (npc) => [
  check('npc.hasName', 'Has a name', npc.name.trim().length > 0, 'NPC needs a name'),
];

export const checkNpcPortrait: CheckProvider<NpcAuthoringInput> = (npc) => [
  check(
    'npc.hasPortrait',
    'Has a portrait asset',
    npc.portraitAssetId != null,
    'Assign a portrait image so the NPC has a visual identity',
  ),
];

export const checkNpcExpressions: CheckProvider<NpcAuthoringInput> = (npc) => {
  const checks: CompletenessCheck[] = [];
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
  return checks;
};

export const checkNpcSchedule: CheckProvider<NpcAuthoringInput> = (npc) => {
  const hasScheduleEntries = (npc.scheduleEntries?.length ?? 0) > 0;
  const hasRoutineGraph = (npc.routineNodes?.length ?? 0) > 0;
  return [
    check(
      'npc.hasSchedule',
      'Has a schedule or routine',
      hasScheduleEntries || hasRoutineGraph,
      'Define a daily schedule or routine graph so the NPC appears in locations',
    ),
  ];
};

export const checkNpcHomeLocation: CheckProvider<NpcAuthoringInput> = (npc) => [
  check(
    'npc.hasHomeLocation',
    'Has a home location',
    npc.homeLocationId != null,
    'Assign a home location for fallback placement',
  ),
];

export const checkNpcPreferences: CheckProvider<NpcAuthoringInput> = (npc) => {
  const meta = (npc.meta ?? {}) as Record<string, unknown>;
  const prefs = meta.preferences as Record<string, unknown> | undefined;
  const hasActivityWeights =
    prefs != null && typeof prefs === 'object' &&
    Object.keys((prefs.activityWeights as Record<string, unknown>) ?? {}).length > 0;
  const hasTraitModifiers =
    prefs != null && typeof prefs === 'object' &&
    Object.keys((prefs.traitModifiers as Record<string, unknown>) ?? {}).length > 0;
  return [
    check(
      'npc.hasPreferences',
      'Has behavior preferences',
      hasActivityWeights || hasTraitModifiers,
      'Set activity weights or trait modifiers for richer autonomous behavior',
    ),
  ];
};

export const checkNpcPersonality: CheckProvider<NpcAuthoringInput> = (npc) => {
  const meta = (npc.meta ?? {}) as Record<string, unknown>;
  const brain = meta.brain as Record<string, unknown> | undefined;
  const personality = meta.personality as Record<string, unknown> | undefined;
  const hasBrainTraits =
    (brain != null && typeof brain === 'object' && Object.keys(brain).length > 0) ||
    (personality != null && typeof personality === 'object' && Object.keys(personality).length > 0);
  return [
    check(
      'npc.hasPersonality',
      'Has personality or brain traits',
      hasBrainTraits,
      'Define personality traits so the NPC has a distinct character',
    ),
  ];
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register all built-in NPC check providers into a registry. */
export function registerBuiltinNpcChecks(registry: CompletenessRegistry): void {
  registry.register('npc', 'core.identity', checkNpcIdentity);
  registry.register('npc', 'core.portrait', checkNpcPortrait);
  registry.register('npc', 'core.expressions', checkNpcExpressions);
  registry.register('npc', 'core.schedule', checkNpcSchedule);
  registry.register('npc', 'core.homeLocation', checkNpcHomeLocation);
  registry.register('npc', 'core.preferences', checkNpcPreferences);
  registry.register('npc', 'core.personality', checkNpcPersonality);
}
