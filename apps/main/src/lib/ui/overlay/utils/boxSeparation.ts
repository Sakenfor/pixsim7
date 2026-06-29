/**
 * Box Separation
 *
 * A DOM-measured separation pass that treats every rendered overlay *unit* —
 * each stack-group container and each ungrouped widget — as one axis-aligned
 * box, ranks them by priority, and nudges lower-priority boxes off the
 * higher-priority ones they overlap.
 *
 * This is the cross-unit coordinator the older {@link ./collision} pass is not:
 *  - collision.ts works on ungrouped widgets only and re-anchors them; it
 *    explicitly exempts stack groups (they're flex-laid-out).
 *  - This pass is anchor-agnostic and operates in pure pixel space on measured
 *    rects, so a wide bottom-center button group, the bottom-left badge stack,
 *    and the downward-growing top-right set column all see each other.
 *
 * The math is deliberately simple and deterministic (no DOM access here — the
 * caller measures and feeds rects in): for each lower-priority box, resolve it
 * against every already-placed higher-priority box by translating along the
 * axis of least penetration, biased toward the box's own anchored edge so it
 * stays on-card, clamped to the container. The result is a per-unit
 * `{ dx, dy }` nudge to apply as a translate.
 */

import type { OverlayAnchor } from '../types';

export interface SeparationBox {
  /** Stable unit id (stack-group key or widget id). */
  id: string;
  /** Higher wins its spot; lower-priority boxes move. */
  priority: number;
  /** Anchor of the unit, used to bias push direction toward its own edge. */
  anchor: OverlayAnchor;
  /** Natural (un-nudged) rect, relative to the container's top-left. */
  rect: Rect;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Nudge {
  dx: number;
  dy: number;
}

/** Treat sub-pixel overlaps as touching, not colliding. */
const EPSILON = 0.5;
/** Keep a small gap so separated boxes don't sit edge-to-edge. */
const SEPARATION_GAP = 4;
/** Never shove a box further than this from its natural spot (sanity clamp). */
const MAX_DISPLACEMENT = 400;

function overlaps(a: Rect, b: Rect): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > EPSILON && oy > EPSILON;
}

/**
 * Resolve `box` against one placed box by translating it **vertically only**.
 *
 * The overlay's three crowded regions — the bottom button group, the bottom-left
 * badge stack, and the (downward-growing) top-right set column — are stacked
 * along the vertical axis, so the correct way to relieve any overlap is to move
 * a box up or down, never sideways. (An earlier least-penetration version would
 * pick the horizontal axis for a corner clip and slam an entire edge column
 * across the card.) Direction is decided by box centers: the box retreats to
 * whichever side of `placed` it already leans toward, so a top box moves up and
 * a bottom box moves down.
 */
function pushOff(box: Rect, placed: Rect): Nudge {
  if (!overlaps(box, placed)) return { dx: 0, dy: 0 };

  const boxCenterY = box.y + box.height / 2;
  const placedCenterY = placed.y + placed.height / 2;

  const upDelta = placed.y - (box.y + box.height) - SEPARATION_GAP; // negative
  const downDelta = placed.y + placed.height - box.y + SEPARATION_GAP; // positive

  return { dx: 0, dy: boxCenterY <= placedCenterY ? upDelta : downDelta };
}

function clampToContainer(rect: Rect, container: Rect): Nudge {
  let dx = 0;
  let dy = 0;
  if (rect.x < container.x) dx = container.x - rect.x;
  else if (rect.x + rect.width > container.x + container.width) {
    dx = container.x + container.width - (rect.x + rect.width);
  }
  if (rect.y < container.y) dy = container.y - rect.y;
  else if (rect.y + rect.height > container.y + container.height) {
    dy = container.y + container.height - (rect.y + rect.height);
  }
  return { dx, dy };
}

function translate(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}

/**
 * Compute per-unit nudges that separate overlapping overlay boxes.
 *
 * Boxes are placed highest-priority first (they keep their natural spot); each
 * subsequent box is pushed clear of every already-placed box, then clamped back
 * inside the container. A box that can't be cleared within the sanity clamp
 * keeps its best-effort partial nudge (still less overlap than nothing).
 *
 * Returns only the units that actually moved (|dx|+|dy| above a sub-pixel
 * threshold), so callers can treat an empty map as "nothing to do".
 */
export function resolveBoxSeparation(
  boxes: SeparationBox[],
  container: Rect,
): Map<string, Nudge> {
  const result = new Map<string, Nudge>();
  if (boxes.length < 2) return result;

  // Highest priority first; stable on ties via id so the pass is deterministic.
  const sorted = [...boxes].sort(
    (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1),
  );

  const placed: Rect[] = [];

  for (const box of sorted) {
    let current = box.rect;
    let dx = 0;
    let dy = 0;

    // A few passes let a box settle when it's pinched between two neighbours.
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const other of placed) {
        const push = pushOff(current, other);
        if (push.dx === 0 && push.dy === 0) continue;
        dx += push.dx;
        dy += push.dy;
        current = translate(box.rect, dx, dy);
        moved = true;
      }
      if (!moved) break;
    }

    // Keep it on-card.
    const clamp = clampToContainer(current, container);
    dx += clamp.dx;
    dy += clamp.dy;

    // Sanity clamp on total travel.
    dx = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, dx));
    dy = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, dy));

    const finalRect = translate(box.rect, dx, dy);
    placed.push(finalRect);

    if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON) {
      result.set(box.id, { dx, dy });
    }
  }

  return result;
}
