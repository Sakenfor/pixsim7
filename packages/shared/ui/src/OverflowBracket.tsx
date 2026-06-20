import React from 'react';
import clsx from 'clsx';

/**
 * OverflowBracket
 *
 * The curved "more items exist" affordance shown at the over-scrollable edge of
 * a windowed/scrollable strip. A single shape source so the ButtonGroup pill row
 * and the overlay badge stack (and any future scroller) stay visually
 * consistent instead of each hand-rolling its own SVG and drifting.
 *
 * Shape adapts to where it's used via `variant`:
 *   - `pill`  — wide, shallow arc that matches a `rounded-full` pill row; the
 *     original ButtonGroup affordance. Supports both orientations.
 *   - `round` — a narrower, deeper cap that echoes a column of *circular* glyphs
 *     (e.g. overlay badge stacks): tighter to the edge and rounder. Vertical
 *     only; falls back to `pill` geometry if asked for horizontally.
 */

export type OverflowBracketOrientation = 'horizontal' | 'vertical';
export type OverflowBracketVariant = 'pill' | 'round';

export interface OverflowBracketProps {
  /** Strip axis. Horizontal brackets sit at left/right; vertical at top/bottom. */
  orientation: OverflowBracketOrientation;
  /** Which edge this bracket marks (start = top/left, end = bottom/right). */
  edge: 'start' | 'end';
  /** True while scrolling toward this edge — nudges the bracket outward briefly. */
  active?: boolean;
  /** Shape preset; see component doc. Defaults to `pill`. */
  variant?: OverflowBracketVariant;
  /** Extra classes merged onto the svg. */
  className?: string;
}

const BASE =
  'absolute pointer-events-none z-10 text-accent-hover overflow-visible transition-transform duration-200 ease-out';

export function OverflowBracket({
  orientation,
  edge,
  active = false,
  variant = 'pill',
  className,
}: OverflowBracketProps) {
  const isHorizontal = orientation === 'horizontal';
  const isStart = edge === 'start';

  // Round cap — vertical only (circular badge column). Narrower + deeper + tighter
  // to the edge than the pill arc.
  if (variant === 'round' && !isHorizontal) {
    return (
      <svg
        className={clsx(BASE, 'inset-x-0 mx-auto w-3/4 h-2', isStart ? '-top-1' : '-bottom-1', className)}
        style={{ transform: `translateY(${active ? (isStart ? -2 : 2) : 0}px)` }}
        viewBox="0 0 24 8"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d={isStart ? 'M0,8 C0,0 24,0 24,8' : 'M0,0 C0,8 24,8 24,0'}
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  // Pill arc (default) — wide, shallow, matching a rounded-full row. Both axes.
  const posClass = isHorizontal
    ? clsx('inset-y-0 h-full w-1.5', isStart ? '-left-1.5' : '-right-1.5')
    : clsx('inset-x-0 w-full h-1.5', isStart ? '-top-1.5' : '-bottom-1.5');
  const transform = isHorizontal
    ? `translateX(${active ? (isStart ? -2 : 2) : 0}px)`
    : `translateY(${active ? (isStart ? -2 : 2) : 0}px)`;
  const d = isHorizontal
    ? isStart
      ? 'M6,0 C0,0 0,24 6,24'
      : 'M0,0 C6,0 6,24 0,24'
    : isStart
      ? 'M0,6 C0,0 24,0 24,6'
      : 'M0,0 C0,6 24,6 24,0';

  return (
    <svg
      className={clsx(BASE, posClass, className)}
      style={{ transform }}
      viewBox={isHorizontal ? '0 0 6 24' : '0 0 24 6'}
      preserveAspectRatio="none"
      fill="none"
    >
      <path d={d} stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
