/**
 * NPC Entity Schema
 *
 * The NPC's checkable fields — defined once, checks fall out automatically.
 * Features extend via `npcSchema.add()`.
 */

import { entity, field } from './entitySchema';
import type { NpcAuthoringInput } from './types';
import type { CompletenessRegistry } from './registry';

// ---------------------------------------------------------------------------
// Schema — THE source of truth for NPC completeness
// ---------------------------------------------------------------------------

export const npcSchema = entity<NpcAuthoringInput>('npc', {

  // ---- Identity -----------------------------------------------------------
  name: field.string('Has a name', 'NPC needs a name'),

  // ---- Visual -------------------------------------------------------------
  portraitAssetId: field.ref('Has a portrait asset', 'Assign a portrait image so the NPC has a visual identity'),

  // ---- Expressions --------------------------------------------------------
  expressions: field.array('Has expression states', 'Add at least one expression state (e.g. idle) for conversation display'),

  idleExpression: field.custom(
    'Has idle expression',
    (npc: NpcAuthoringInput) => {
      if ((npc.expressions?.length ?? 0) === 0) return true; // not relevant yet
      return npc.expressions!.some((e) => e.state === 'idle');
    },
    'An idle expression is recommended as fallback',
  ).warn(),

  // ---- Schedule / Routine -------------------------------------------------
  schedule: field.custom(
    'Has a schedule or routine',
    (npc: NpcAuthoringInput) =>
      (npc.scheduleEntries?.length ?? 0) > 0 || (npc.routineNodes?.length ?? 0) > 0,
    'Define a daily schedule or routine graph so the NPC appears in locations',
  ),

  // ---- Home location ------------------------------------------------------
  homeLocationId: field.ref('Has a home location', 'Assign a home location for fallback placement'),

  // ---- Preferences --------------------------------------------------------
  preferences: field.custom(
    'Has behavior preferences',
    (npc: NpcAuthoringInput) => {
      const prefs = ((npc.meta ?? {}) as Record<string, unknown>).preferences as
        | Record<string, unknown>
        | undefined;
      if (prefs == null || typeof prefs !== 'object') return false;
      const hasActivityWeights =
        Object.keys((prefs.activityWeights as Record<string, unknown>) ?? {}).length > 0;
      const hasTraitModifiers =
        Object.keys((prefs.traitModifiers as Record<string, unknown>) ?? {}).length > 0;
      return hasActivityWeights || hasTraitModifiers;
    },
    'Set activity weights or trait modifiers for richer autonomous behavior',
  ),

  // ---- Personality / Brain ------------------------------------------------
  personality: field.custom(
    'Has personality or brain traits',
    (npc: NpcAuthoringInput) => {
      const meta = (npc.meta ?? {}) as Record<string, unknown>;
      const brain = meta.brain as Record<string, unknown> | undefined;
      const personality = meta.personality as Record<string, unknown> | undefined;
      return (
        (brain != null && typeof brain === 'object' && Object.keys(brain).length > 0) ||
        (personality != null && typeof personality === 'object' && Object.keys(personality).length > 0)
      );
    },
    'Define personality traits so the NPC has a distinct character',
  ),
});

// ---------------------------------------------------------------------------
// Backward-compat: registry bridge
// ---------------------------------------------------------------------------

/**
 * Register NPC checks into a CompletenessRegistry.
 *
 * Prefer using `npcSchema.check()` directly — this helper exists so the
 * registry-based code path keeps working during migration.
 */
export function registerBuiltinNpcChecks(registry: CompletenessRegistry): void {
  registry.register<NpcAuthoringInput>('npc', 'schema', (npc) => npcSchema.check(npc));
}
