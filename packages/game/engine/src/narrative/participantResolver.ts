/**
 * Narrative participant resolution via capability-based behavior dispatch.
 *
 * Replaces the hardcoded `kind === 'npc'` / `ref.startsWith('npc:')` gating that
 * used to live in `runtimeIntegration.getNpcIdFromIntent`. An interaction
 * candidate (participant or target) is a *narrative participant* iff its
 * `GameObjectEntity` carries the `narrative_participant` capability — resolved
 * through the shared `GameObjectBehaviorRegistry` (plan
 * `gameobject-runtime-refactor-v1`, commit d06e76a2b). Resolution is entity-
 * agnostic: any kind opts in by declaring the capability (canonical npc objects
 * do, via `buildNpcObject`) or by appearing in `KIND_CAPABILITY_DEFAULTS`.
 */

import type {
  GameObject,
  GameObjectCapability,
  GameSessionDTO,
  InteractionParticipant,
  InteractionTarget,
} from '@pixsim7/shared.types';
import {
  GameObjectBehaviorRegistry,
  GameObjectEntity,
  getSessionGameObject,
  type BehaviorIntent,
  type BehaviorOutcome,
} from '../runtime';

/** Capability that marks a game object as drivable by the narrative runtime. */
export const NARRATIVE_PARTICIPANT_CAPABILITY = 'narrative_participant';

/** Behavior intent verb used to resolve a narrative participant's numeric id. */
const RESOLVE_INTENT = 'resolve_narrative_participant';

/**
 * Default capabilities inferred for an interaction candidate by `kind`, used
 * when the candidate is not (yet) materialized in the canonical store and as a
 * safety net for hydrated objects that predate the capability. This is the
 * single declarative home for "which kinds are narrative participants"; a new
 * kind opts in by adding itself here or by declaring the capability on its
 * canonical builder.
 */
const KIND_CAPABILITY_DEFAULTS: Record<string, readonly string[]> = {
  npc: [NARRATIVE_PARTICIPANT_CAPABILITY],
};

function numericId(value: number | string | undefined | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function refParts(ref: string | undefined): { kind: string; id: string } | null {
  if (!ref || !ref.includes(':')) return null;
  const idx = ref.indexOf(':');
  const kind = ref.slice(0, idx).trim();
  const id = ref.slice(idx + 1).trim();
  if (!kind || !id) return null;
  return { kind, id };
}

/**
 * Behavior registry that owns narrative-participant resolution. The handler
 * matches any entity carrying the capability and yields its numeric id; a
 * candidate whose id is non-numeric defers (so the next candidate is tried).
 */
export const narrativeBehaviorRegistry = new GameObjectBehaviorRegistry();
narrativeBehaviorRegistry.register({
  id: 'narrative-participant-id',
  capability: NARRATIVE_PARTICIPANT_CAPABILITY,
  intent: RESOLVE_INTENT,
  handle(ctx): BehaviorOutcome {
    const fromId = numericId(ctx.entity.id);
    if (fromId !== null) return { handled: true, result: fromId };
    const fromRef = numericId(refParts(ctx.entity.ref)?.id);
    if (fromRef !== null) return { handled: true, result: fromRef };
    return { handled: false };
  },
});

function mergeCapabilities(
  existing: readonly GameObjectCapability[],
  inferred: readonly string[]
): GameObjectCapability[] {
  const byId = new Map<string, GameObjectCapability>();
  for (const cap of existing) byId.set(cap.id, cap);
  for (const id of inferred) {
    if (!byId.has(id)) byId.set(id, { id, enabled: true });
  }
  return [...byId.values()];
}

/**
 * Project an interaction candidate into a `GameObjectEntity` for capability
 * dispatch. Prefers the materialized canonical object (carrying its declared
 * capabilities) and always layers in the kind-inferred defaults so npc-like
 * candidates resolve even before they are stored. Returns null when the
 * candidate has no resolvable kind+id.
 */
function candidateEntity(
  session: GameSessionDTO,
  candidate: InteractionTarget
): GameObjectEntity | null {
  const parts = refParts(candidate.ref);
  const kind = (candidate.kind ?? parts?.kind)?.trim();
  const rawId = candidate.id ?? parts?.id;
  if (!kind || rawId === undefined || rawId === null || rawId === '') return null;

  const ref =
    candidate.ref ?? `${kind}:${typeof rawId === 'string' ? rawId.trim() : rawId}`;
  const stored = getSessionGameObject(session, ref);
  const inferred = KIND_CAPABILITY_DEFAULTS[kind] ?? [];
  const capabilities = mergeCapabilities(stored?.capabilities ?? [], inferred);

  // No declared and no inferred capability -> not a narrative kind; skip.
  if (capabilities.length === 0 && !stored) return null;

  const pojo = stored
    ? ({ ...stored, capabilities } as GameObject)
    : ({
        kind,
        id: rawId,
        ref,
        name: ref,
        transform: { worldId: 0, position: { x: 0, y: 0 }, space: 'world_2d' },
        capabilities,
      } as unknown as GameObject);

  return GameObjectEntity.fromPOJO(pojo);
}

/**
 * Ordered candidates for narrative resolution: primary-role participants first,
 * then the remaining participants, then the bare target — mirroring the
 * precedence of the previous kind-based lookup.
 */
function orderedCandidates(intent: {
  participants?: InteractionParticipant[];
  primaryRole?: string;
  target?: InteractionTarget;
}): InteractionTarget[] {
  const participants = intent.participants ?? [];
  const primaryRole = intent.primaryRole;
  const ordered: InteractionTarget[] = primaryRole
    ? [
        ...participants.filter((p) => p.role === primaryRole),
        ...participants.filter((p) => p.role !== primaryRole),
      ]
    : [...participants];
  if (intent.target) ordered.push(intent.target);
  return ordered;
}

/**
 * Resolve the numeric id of the narrative participant for an interaction, or
 * null when none of the candidates is a narrative participant. Each candidate
 * is dispatched through the behavior registry; the first that the registry
 * handles (has the capability and a numeric id) wins.
 */
export async function resolveNarrativeParticipantId(
  session: GameSessionDTO,
  intent: {
    participants?: InteractionParticipant[];
    primaryRole?: string;
    target?: InteractionTarget;
  }
): Promise<number | null> {
  const behaviorIntent: BehaviorIntent = { type: RESOLVE_INTENT };
  for (const candidate of orderedCandidates(intent)) {
    const entity = candidateEntity(session, candidate);
    if (!entity) continue;
    const outcome = await narrativeBehaviorRegistry.dispatch({
      entity,
      intent: behaviorIntent,
      host: session,
    });
    if (outcome.handled && typeof outcome.result === 'number') {
      return outcome.result;
    }
  }
  return null;
}
