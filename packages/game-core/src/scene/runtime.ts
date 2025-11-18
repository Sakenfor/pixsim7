/**
 * Scene Runtime Helpers
 *
 * Pure TypeScript helpers for scene progression and playback.
 * Extracted from ScenePlayer UI to enable headless scene execution.
 */

import type {
  Scene,
  SceneNode,
  SceneEdge,
  SceneRuntimeState,
  PlaybackMode,
  MediaSegment,
  SelectionStrategy,
} from '@pixsim7/types';

/**
 * Evaluates edge conditions against runtime flags
 */
export function evaluateEdgeConditions(edge: SceneEdge, flags: Record<string, any>): boolean {
  if (!edge.conditions || edge.conditions.length === 0) return true;
  return edge.conditions.every(c => {
    const v = flags[c.key];
    switch (c.op) {
      case 'neq': return v !== c.value;
      case 'gt': return v > c.value;
      case 'lt': return v < c.value;
      case 'gte': return v >= c.value;
      case 'lte': return v <= c.value;
      case 'includes': return Array.isArray(v) && v.includes(c.value);
      case 'eq':
      default:
        return v === c.value;
    }
  });
}

/**
 * Applies edge effects to flags, returning new flags object
 */
export function applyEdgeEffects(effects: SceneEdge['effects'], prev: Record<string, any>): Record<string, any> {
  if (!effects || effects.length === 0) return prev;
  const next = { ...prev };
  for (const eff of effects) {
    const cur = next[eff.key];
    switch (eff.op) {
      case 'inc': next[eff.key] = (typeof cur === 'number' ? cur : 0) + (eff.value ?? 1); break;
      case 'dec': next[eff.key] = (typeof cur === 'number' ? cur : 0) - (eff.value ?? 1); break;
      case 'push': next[eff.key] = Array.isArray(cur) ? [...cur, eff.value] : [eff.value]; break;
      case 'flag': next[eff.key] = true; break;
      case 'set':
      default: next[eff.key] = eff.value;
    }
  }
  return next;
}

/**
 * Type guard for progression playback mode
 */
export function isProgression(playback?: PlaybackMode): playback is Extract<PlaybackMode, { kind: 'progression' }> {
  return playback?.kind === 'progression';
}

/**
 * Gets playable edges for the current state
 * Filters scene edges by from === state.currentNodeId and evaluateEdgeConditions
 */
export function getPlayableEdges(scene: Scene, state: SceneRuntimeState): SceneEdge[] {
  const outgoingEdges = scene.edges.filter(e => e.from === state.currentNodeId);
  return outgoingEdges.filter(e => evaluateEdgeConditions(e, state.flags));
}

/**
 * Advances progression index within progression playback
 * Returns new state with incremented progressionIndex up to segments.length - 1
 */
export function advanceProgression(
  playback: PlaybackMode | undefined,
  state: SceneRuntimeState
): SceneRuntimeState {
  if (!isProgression(playback)) return state;

  const totalSegments = playback.segments.length;
  const currentIndex = state.progressionIndex ?? -1;
  const nextIndex = Math.min(totalSegments - 1, currentIndex + 1);

  return {
    ...state,
    progressionIndex: nextIndex,
  };
}

/**
 * Selects media segment based on node configuration and runtime state
 * Honors progression segmentIds first, then applies selection strategy
 */
export function selectMediaSegment(args: {
  node: SceneNode | undefined;
  state: SceneRuntimeState;
}): MediaSegment | undefined {
  const { node, state } = args;

  const media = node?.media;
  if (!media || media.length === 0) return undefined;

  const sel = node?.selection || { kind: 'ordered' as const };
  const playback = node?.playback;
  const pick = (list: MediaSegment[], idx = 0) => list[Math.max(0, Math.min(list.length - 1, idx))];

  // If progression defines segmentIds for current step, honor that first
  if (isProgression(playback) && (state.progressionIndex ?? -1) >= 0) {
    const seg = playback.segments[state.progressionIndex!];
    if (seg?.segmentIds && seg.segmentIds.length) {
      // ordered within specified ids
      const ids = seg.segmentIds;
      const idx = 0;
      const found = media.find(m => m.id === ids[idx]);
      return found || media[0];
    }
  }

  // Apply selection strategy
  switch (sel.kind) {
    case 'random': {
      const r = Math.floor(Math.random() * media.length);
      return media[r];
    }
    case 'pool': {
      const pool = sel.filterTags?.length ? media.filter(m => m.tags?.some(t => sel.filterTags!.includes(t))) : media;
      const count = Math.max(1, sel.count ?? 1);
      const r = pool.length ? pool[Math.min(pool.length - 1, Math.floor(Math.random() * pool.length))] : media[0];
      return r;
    }
    case 'ordered':
    default:
      return pick(media, 0);
  }
}

/**
 * Gets the default next edge for auto-advance scenarios
 * Returns edge if:
 * - autoAdvance is true
 * - No remaining progression steps
 * - Exactly 1 playable edge with no explicit isDefault, OR an edge with isDefault exists
 */
export function getDefaultNextEdge(args: {
  scene: Scene;
  state: SceneRuntimeState;
  autoAdvance: boolean;
  node?: SceneNode;
}): SceneEdge | undefined {
  const { scene, state, autoAdvance, node } = args;

  if (!autoAdvance) return undefined;

  const playback = node?.playback;
  const progression = isProgression(playback) ? playback : undefined;

  // Check if we're still in progression
  if (progression) {
    const totalSegments = progression.segments.length;
    const currentIndex = state.progressionIndex ?? -1;
    if (currentIndex < totalSegments - 1) {
      // Still progressing, don't auto-advance to next node
      return undefined;
    }
  }

  const playableEdges = getPlayableEdges(scene, state);

  // Check for default edge
  const defaultEdge = playableEdges.find(e => e.isDefault);
  if (defaultEdge) return defaultEdge;

  // If exactly one edge and no progression, use it
  if (playableEdges.length === 1 && !progression) {
    return playableEdges[0];
  }

  return undefined;
}
