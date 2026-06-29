import { describe, it, expect } from 'vitest';

import { resolveBoxSeparation, type SeparationBox, type Rect } from '../boxSeparation';

const CONTAINER: Rect = { x: 0, y: 0, width: 300, height: 300 };

function box(
  id: string,
  priority: number,
  anchor: SeparationBox['anchor'],
  rect: Rect,
): SeparationBox {
  return { id, priority, anchor, rect };
}

describe('resolveBoxSeparation', () => {
  it('returns nothing for fewer than two boxes', () => {
    const r = resolveBoxSeparation(
      [box('a', 10, 'top-left', { x: 0, y: 0, width: 20, height: 20 })],
      CONTAINER,
    );
    expect(r.size).toBe(0);
  });

  it('leaves non-overlapping boxes untouched', () => {
    const r = resolveBoxSeparation(
      [
        box('a', 10, 'top-left', { x: 0, y: 0, width: 20, height: 20 }),
        box('b', 5, 'top-right', { x: 280, y: 0, width: 20, height: 20 }),
      ],
      CONTAINER,
    );
    expect(r.size).toBe(0);
  });

  it('moves the lower-priority box and keeps the higher one in place', () => {
    const r = resolveBoxSeparation(
      [
        box('high', 30, 'bottom-center', { x: 130, y: 260, width: 60, height: 30 }),
        box('low', 25, 'bottom-left', { x: 120, y: 265, width: 40, height: 20 }),
      ],
      CONTAINER,
    );
    expect(r.has('high')).toBe(false);
    expect(r.has('low')).toBe(true);
  });

  it('pushes a bottom-anchored box upward (its anchor bias)', () => {
    // A bottom-left badge overlapped by a higher-priority bottom-center group
    // should slide UP (negative dy), staying on its own edge.
    const r = resolveBoxSeparation(
      [
        box('btn', 35, 'bottom-center', { x: 110, y: 250, width: 80, height: 30 }),
        box('badge', 25, 'bottom-left', { x: 100, y: 255, width: 40, height: 20 }),
      ],
      CONTAINER,
    );
    const n = r.get('badge');
    expect(n).toBeDefined();
    expect(n!.dy).toBeLessThan(0);
    expect(n!.dx).toBe(0);
  });

  it('never pushes a clipped edge column sideways (only vertical nudges)', () => {
    // Regression: a wide bottom-center button group clipping the bottom of the
    // top-right set column must NOT slam the whole column left — it may only
    // move vertically.
    const r = resolveBoxSeparation(
      [
        box('button', 35, 'bottom-center', { x: 60, y: 250, width: 180, height: 34 }),
        box('tr-column', 20, 'top-right', { x: 250, y: 8, width: 40, height: 260 }),
      ],
      CONTAINER,
    );
    const n = r.get('tr-column');
    if (n) expect(n.dx).toBe(0);
  });

  it('only ever produces vertical nudges', () => {
    const r = resolveBoxSeparation(
      [
        box('a', 30, 'bottom-center', { x: 100, y: 250, width: 100, height: 30 }),
        box('b', 25, 'bottom-left', { x: 90, y: 255, width: 50, height: 20 }),
        box('c', 20, 'bottom-right', { x: 180, y: 255, width: 50, height: 20 }),
      ],
      CONTAINER,
    );
    for (const n of r.values()) expect(n.dx).toBe(0);
  });

  it('keeps nudged boxes inside the container', () => {
    // Two stacked boxes near the bottom edge: the lower-priority one is pushed
    // up but must not leave the top of the container.
    const r = resolveBoxSeparation(
      [
        box('a', 30, 'bottom-right', { x: 250, y: 0, width: 40, height: 300 }),
        box('b', 5, 'bottom-right', { x: 250, y: 270, width: 40, height: 30 }),
      ],
      CONTAINER,
    );
    const n = r.get('b');
    if (n) {
      const top = 270 + n.dy;
      const left = 250 + n.dx;
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left).toBeGreaterThanOrEqual(0);
    }
  });

  it('is idempotent: re-running on already-separated boxes is a no-op', () => {
    const boxes = [
      box('high', 30, 'bottom-center', { x: 110, y: 250, width: 80, height: 30 }),
      box('low', 25, 'bottom-left', { x: 100, y: 255, width: 40, height: 20 }),
    ];
    const first = resolveBoxSeparation(boxes, CONTAINER);
    // Apply the nudge to the natural rects, then re-run — should find no overlap.
    const settled = boxes.map((b) => {
      const n = first.get(b.id);
      return n
        ? { ...b, rect: { ...b.rect, x: b.rect.x + n.dx, y: b.rect.y + n.dy } }
        : b;
    });
    const second = resolveBoxSeparation(settled, CONTAINER);
    expect(second.size).toBe(0);
  });
});
