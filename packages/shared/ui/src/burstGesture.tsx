/**
 * Reusable "burst" gesture: press-and-hold (or drag) a button to reveal a
 * count slider, drag to choose how many times to fire, release to commit. A
 * quick tap (no hold, no drag) falls through to the button's normal click.
 *
 * Orientation-aware so it fits both narrow buttons (vertical — drag up) and
 * wide pill rows (horizontal — drag right). Extras:
 *  - Drag back past the start (or press Escape) to cancel — releases nothing.
 *  - Drag past the last ladder stop to enter a free counter (capped) for counts
 *    beyond the presets.
 *
 * The gesture is driven by window-level listeners (so moves keep arriving once
 * the pointer leaves the button) and suppresses native HTML5 drag for the press
 * duration (media cards and slot containers have `draggable` ancestors that
 * would otherwise hijack the drag).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

import { PortalFloat, type AnchorPlacement } from './PortalFloat';

export type BurstOrientation = 'vertical' | 'horizontal';

export interface UseBurstGestureOptions {
  /** Ascending count stops the slider snaps through, e.g. [1, 2, 3, 5, 10]. */
  steps: number[];
  /** Fire `count` times. Called on release after an engaged, non-cancelled gesture. */
  onFire: (count: number) => void;
  /** Drag axis: 'vertical' (up = more) or 'horizontal' (right = more). Default vertical. */
  orientation?: BurstOrientation;
  /** Pixels of travel between steps. Default 22. */
  stepPx?: number;
  /** Movement (px) before the gesture engages from a drag. Default 5. */
  threshold?: number;
  /** Hold time (ms) that reveals the slider without any movement. Default 160. */
  holdMs?: number;
  /** Drag back past the start by this many px to enter the cancel zone. Default 20. */
  cancelPx?: number;
  /** Pixels of travel per +1 once past the last preset stop. Default 12. */
  customStepPx?: number;
  /** Hard cap on the count the free counter can reach. Default 50. */
  maxCount?: number;
  /** When true the gesture is inert (handlers no-op). */
  disabled?: boolean;
}

export interface BurstGestureState {
  active: boolean;
  /** Selected count; 0 while in the cancel zone. */
  count: number;
  /** Ladder index for chip highlighting (clamped to the preset range). */
  index: number;
  /** True once past the last preset stop (free counter). */
  custom: boolean;
  /** True while in the cancel zone (release fires nothing). */
  canceling: boolean;
  steps: number[];
  buttonRef: React.RefObject<HTMLButtonElement>;
  /** Spread onto the target button. */
  pointerHandlers: { onPointerDown: (e: React.PointerEvent) => void };
  /**
   * Call at the very top of the button's onClick. Returns true when the click
   * trails an engaged gesture and must be swallowed (so the single action
   * doesn't fire in addition to the burst).
   */
  shouldSwallowClick: () => boolean;
}

type InternalState = { active: boolean; count: number; index: number; custom: boolean; canceling: boolean };
const IDLE: InternalState = { active: false, count: 0, index: 0, custom: false, canceling: false };

export function useBurstGesture(options: UseBurstGestureOptions): BurstGestureState {
  const { steps, onFire, orientation = 'vertical', disabled } = options;
  const stepPx = options.stepPx ?? 22;
  const threshold = options.threshold ?? 5;
  const holdMs = options.holdMs ?? 160;
  const cancelPx = options.cancelPx ?? 20;
  const customStepPx = options.customStepPx ?? 12;
  const maxCount = options.maxCount ?? 50;

  const [state, setState] = useState<InternalState>(IDLE);
  const activeRef = useRef(false);
  const resolvedRef = useRef<InternalState>(IDLE);
  const suppressClickRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || steps.length === 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const start = orientation === 'vertical' ? e.clientY : e.clientX;
    const lastIdx = steps.length - 1;
    activeRef.current = false;
    resolvedRef.current = IDLE;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    // Capture the pointer so dragging off the button doesn't fire
    // pointerleave/mouseleave on the hover-gated host (media-card overlay,
    // expand popover) — which would unmount the button mid-gesture and close
    // the slider. Boundary events stay routed to the button while captured.
    const pointerId = e.pointerId;
    const captureEl = buttonRef.current;
    try { captureEl?.setPointerCapture(pointerId); } catch { /* best-effort */ }

    // vertical: up = positive; horizontal: right = positive
    const deltaFor = (ev: PointerEvent) =>
      orientation === 'vertical' ? start - ev.clientY : ev.clientX - start;

    const resolve = (d: number): InternalState => {
      if (d < -cancelPx) {
        return { active: true, count: 0, index: 0, custom: false, canceling: true };
      }
      const pos = Math.max(0, d);
      const slot = Math.floor(pos / stepPx);
      if (slot <= lastIdx) {
        return { active: true, count: steps[slot], index: slot, custom: false, canceling: false };
      }
      const extra = 1 + Math.floor((pos - steps.length * stepPx) / customStepPx);
      const count = Math.min(maxCount, steps[lastIdx] + Math.max(1, extra));
      return { active: true, count, index: lastIdx, custom: true, canceling: false };
    };
    const apply = (d: number) => {
      activeRef.current = true;
      const next = resolve(d);
      resolvedRef.current = next;
      setState((s) =>
        s.active && s.count === next.count && s.canceling === next.canceling && s.custom === next.custom && s.index === next.index
          ? s
          : next,
      );
    };

    const onMove = (ev: PointerEvent) => {
      const d = deltaFor(ev);
      if (!activeRef.current && Math.abs(d) < threshold) return; // wait for a real drag (or the hold timer)
      apply(d);
    };
    const onDragStart = (ev: DragEvent) => ev.preventDefault();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    };
    const teardown = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      try { captureEl?.releasePointerCapture(pointerId); } catch { /* already released */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('dragstart', onDragStart, true);
      window.removeEventListener('keydown', onKeyDown, true);
      teardownRef.current = null;
    };
    const finish = (commit: boolean) => {
      const resolved = resolvedRef.current;
      const fired = activeRef.current && commit && !resolved.canceling && resolved.count >= 1;
      const count = resolved.count;
      teardown();
      activeRef.current = false;
      resolvedRef.current = IDLE;
      setState(IDLE);
      if (fired) {
        // Swallow the click trailing the gesture. Auto-clear next tick in case
        // the release happened off-button and no click ever arrives.
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        onFire(count);
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('dragstart', onDragStart, true);
    window.addEventListener('keydown', onKeyDown, true);
    // Press-and-hold reveals the slider even without movement.
    holdTimer = setTimeout(() => { if (!activeRef.current) apply(0); }, holdMs);
    teardownRef.current = teardown;
  }, [disabled, steps, orientation, stepPx, threshold, holdMs, cancelPx, customStepPx, maxCount, onFire]);

  // Drop any in-flight listeners if the host unmounts mid-gesture.
  useEffect(() => () => teardownRef.current?.(), []);

  const shouldSwallowClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    active: state.active,
    count: state.count,
    index: state.index,
    custom: state.custom,
    canceling: state.canceling,
    steps,
    buttonRef,
    pointerHandlers: { onPointerDown },
    shouldSwallowClick,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicators
// ─────────────────────────────────────────────────────────────────────────────

// Visual vocabulary intentionally mirrors the on-card gesture overlays
// (apps/main/src/lib/gestures/GestureOverlay.tsx): dark translucent surface,
// white text, `×N` tabular-nums, and a `✕` + strikethrough cancel — so the
// button burst reads as the same family as a card swipe.
function BurstChips({ state, orientation }: { state: BurstGestureState; orientation: BurstOrientation }) {
  const horizontal = orientation === 'horizontal';
  const { steps, index, count, custom, canceling } = state;
  if (canceling) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center gap-1.5 rounded-2xl bg-black/60 backdrop-blur-sm ring-1 ring-white/15 shadow-2xl select-none pointer-events-none',
          horizontal ? 'px-3 py-1.5' : 'flex-col px-2 py-2',
        )}
      >
        <span className="text-base leading-none text-white/70">{'✕'}</span>
        <span className="text-[11px] font-medium text-white/55 line-through">cancel</span>
      </div>
    );
  }
  return (
    <div
      className={clsx(
        'flex items-center rounded-2xl bg-black/60 backdrop-blur-sm ring-1 ring-white/15 shadow-2xl select-none pointer-events-none',
        horizontal ? 'flex-row gap-0.5 px-2 py-1' : 'flex-col-reverse gap-0.5 px-1.5 py-2',
      )}
    >
      <div className={clsx('text-[11px] font-bold text-white tabular-nums', horizontal ? 'order-last ml-1.5' : 'order-last mb-0.5')}>
        &times;{count}
      </div>
      {steps.map((step, i) => {
        // Past the last preset, the final stop morphs into the live drag count.
        const morph = custom && i === steps.length - 1;
        const isActive = morph || (!custom && i === index);
        const isPassed = !isActive && (custom ? i < steps.length - 1 : i < index);
        return (
          <div
            key={step}
            className={clsx(
              'min-w-[24px] h-[24px] px-1 rounded-full text-[12px] font-bold flex items-center justify-center transition-all duration-75 tabular-nums',
              isActive ? 'bg-white text-black scale-110 shadow' : isPassed ? 'bg-white/25 text-white' : 'text-white/40',
            )}
          >
            {morph ? count : step}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Floating count slider anchored above a button. Use for compact buttons where
 * an inline track wouldn't fit (e.g. the media-card pill).
 */
export function BurstLadder({
  state,
  orientation = 'vertical',
  placement = 'top',
  offset = 8,
}: {
  state: BurstGestureState;
  orientation?: BurstOrientation;
  placement?: AnchorPlacement;
  offset?: number;
}) {
  if (!state.active) return null;
  const anchor = state.buttonRef.current;
  if (!anchor) return null;
  return (
    <PortalFloat anchor={anchor} placement={placement} offset={offset}>
      <BurstChips state={state} orientation={orientation} />
    </PortalFloat>
  );
}

/**
 * Inline count slider that overlays its (relatively-positioned) host button —
 * the button visually becomes the slider track. Use for wide pill rows. Render
 * as a child of a `relative` button.
 */
export function BurstTrackOverlay({ state }: { state: BurstGestureState }) {
  if (!state.active) return null;
  const { steps, index, count, custom, canceling } = state;
  if (canceling) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 rounded-[inherit] bg-black/75 select-none pointer-events-none">
        <span className="text-sm leading-none text-white/70">{'✕'}</span>
        <span className="text-[11px] font-medium text-white/55 line-through">cancel</span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-10 flex items-center gap-1 rounded-[inherit] bg-black/70 px-2 select-none pointer-events-none">
      {steps.map((step, i) => {
        // Past the last preset, the final stop morphs into the live drag count.
        const morph = custom && i === steps.length - 1;
        const isActive = morph || (!custom && i === index);
        const isPassed = !isActive && (custom ? i < steps.length - 1 : i < index);
        return (
          <div
            key={step}
            className={clsx(
              'flex-1 h-[18px] rounded-full text-[11px] font-bold flex items-center justify-center transition-all duration-75 tabular-nums',
              isActive ? 'bg-white text-black scale-105 shadow' : isPassed ? 'bg-white/25 text-white' : 'text-white/40',
            )}
          >
            {morph ? count : step}
          </div>
        );
      })}
    </div>
  );
}
