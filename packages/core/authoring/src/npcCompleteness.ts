/**
 * NPC Entity Schema
 *
 * The NPC's checkable fields are defined once and checks fall out automatically.
 */

import { entity, field } from './entitySchema';
import type { EntitySchema } from './entitySchema';
import type { NpcAuthoringInput } from './types';

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

/**
 * Build the base NPC schema.
 *
 * Use this factory when a feature needs an isolated schema instance rather than
 * mutating the shared singleton.
 */
export function createNpcSchema(): EntitySchema<NpcAuthoringInput> {
  return entity<NpcAuthoringInput>('npc', {
    // ---- Identity ---------------------------------------------------------
    name: field
      .string<NpcAuthoringInput>('Has a name', 'NPC needs a name')
      .id('npc.hasName'),

    // ---- Visual -----------------------------------------------------------
    portraitAssetId: field
      .ref<NpcAuthoringInput>(
        'Has a portrait asset',
        'Assign a portrait image so the NPC has a visual identity',
      )
      .id('npc.hasPortrait'),

    // ---- Expressions ------------------------------------------------------
    expressions: field
      .array<NpcAuthoringInput>(
        'Has expression states',
        'Add at least one expression state (e.g. idle) for conversation display',
      )
      .id('npc.hasExpressions'),

    idleExpression: field
      .custom<NpcAuthoringInput>(
        'Missing idle expression',
        (npc) => {
          const expressions = npc.expressions ?? [];
          if (expressions.length === 0) return 'skip';
          return expressions.some((e) => e.state === 'idle') ? 'skip' : false;
        },
        'An idle expression is recommended as fallback',
      )
      .warn()
      .id('npc.missingIdle'),

    // ---- Schedule / Routine ----------------------------------------------
    schedule: field
      .custom<NpcAuthoringInput>(
        'Has a schedule or routine',
        (npc) =>
          (npc.scheduleEntries?.length ?? 0) > 0 || (npc.routineNodes?.length ?? 0) > 0,
        'Define a daily schedule or routine graph so the NPC appears in locations',
      )
      .id('npc.hasSchedule'),

    // ---- Home location ----------------------------------------------------
    homeLocationId: field
      .ref<NpcAuthoringInput>(
        'Has a home location',
        'Assign a home location for fallback placement',
      )
      .id('npc.hasHomeLocation'),

    // ---- Preferences ------------------------------------------------------
    preferences: field
      .custom<NpcAuthoringInput>(
        'Has behavior preferences',
        (npc) => {
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
      )
      .id('npc.hasPreferences'),

    // ---- Personality / Brain ---------------------------------------------
    personality: field
      .custom<NpcAuthoringInput>(
        'Has personality or brain traits',
        (npc) => {
          const meta = (npc.meta ?? {}) as Record<string, unknown>;
          const brain = meta.brain as Record<string, unknown> | undefined;
          const personality = meta.personality as Record<string, unknown> | undefined;
          return (
            (brain != null && typeof brain === 'object' && Object.keys(brain).length > 0) ||
            (personality != null &&
              typeof personality === 'object' &&
              Object.keys(personality).length > 0)
          );
        },
        'Define personality traits so the NPC has a distinct character',
      )
      .id('npc.hasPersonality'),
  });
}

// Shared singleton for simple use-cases.
export const npcSchema = createNpcSchema();
