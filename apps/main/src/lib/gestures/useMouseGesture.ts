import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

// ─── Public types ────────────────────────────────────────────────────────────

export type GestureDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Lifecycle phase of a gesture interaction.
 *
 * - `idle`      — no gesture in progress
 * - `pending`   — pointer is down, tracking movement, threshold not yet reached
 * - `committed` — threshold exceeded, gesture is active (visual feedback shown)
 */
export type GesturePhase = 'idle' | 'pending' | 'committed';

/**
 * Discriminated union describing a completed gesture.
 * New gesture types (hold, radial, double-swipe) add new variants here
 * without breaking existing consumers.
 */
export type GestureEvent =
  | GestureSwipeEvent;

export interface GestureSwipeEvent {
  type: 'swipe';
  direction: GestureDirection;
  /** Total drag distance in pixels */
  distance: number;
  /** Horizontal delta from start */
  dx: number;
  /** Vertical delta from start */
  dy: number;
}

/**
 * Snapshot of an in-progress gesture.
 * Consumers use this for live visual feedback (overlays, counters, radial menus).
 * `null` when phase is `idle`.
 */
export interface ActiveGesture {
  type: 'swipe';
  phase: GesturePhase;
  direction: GestureDirection;
  distance: number;
  dx: number;
  dy: number;
}

// ─── Hook options & result ───────────────────────────────────────────────────

interface UseMouseGestureOptions {
  enabled?: boolean;
  threshold?: number;
  /**
   * Fraction of the card (0–0.5) that acts as an inert edge margin.
   * Pointer-down events landing in this outer ring are ignored.
   * Default 0.2 → the center 60% of the card is the active zone.
   */
  edgeInset?: number;
  /** Fired when a gesture completes (pointer released after threshold exceeded). */
  onGesture: (event: GestureEvent) => void;
  /**
   * Optional callback fired on phase transitions.
   * Useful for triggering side effects (haptics, sounds, radial menu open/close)
   * without polling the phase state.
   */
  onPhaseChange?: (phase: GesturePhase, gesture: ActiveGesture | null) => void;
  /**
   * Opt-in: fired once when the pointer dwells near its press point (the center
   * / cancel zone) for `centerDwellMs` without swiping out — whether that's a
   * press-and-hold from rest or a drag back to center after a committed swipe.
   * The gesture is ended cleanly (no action, click suppressed) just before this
   * fires, and the caller takes over (e.g. opens a preset switcher anchored at
   * the returned `center`, in client coords).
   */
  onCenterDwell?: (center: { x: number; y: number }) => void;
  /** Dwell duration for `onCenterDwell`. Default 350ms. */
  centerDwellMs?: number;
}

interface UseMouseGestureResult {
  gestureHandlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
  };
  /** Current gesture state, or null when idle */
  activeGesture: ActiveGesture | null;
  /** True if a gesture just completed — use to suppress the subsequent click event */
  gestureConsumed: React.RefObject<boolean>;
}

// ─── Internals ───────────────────────────────────────────────────────────────

const INTERACTIVE_SELECTORS = 'button, a, [data-interactive], [role="button"], input, select, textarea';

function resolveDirection(dx: number, dy: number): GestureDirection {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMouseGesture({
  enabled = true,
  threshold = 30,
  edgeInset = 0.2,
  onGesture,
  onPhaseChange,
  onCenterDwell,
  centerDwellMs = 350,
}: UseMouseGestureOptions): UseMouseGestureResult {
  const [activeGesture, setActiveGesture] = useState<ActiveGesture | null>(null);

  const gestureConsumed = useRef(false);

  const stateRef = useRef({
    startX: 0,
    startY: 0,
    committed: false,
    pointerId: -1,
    lockedDirection: null as GestureDirection | null,
  });

  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;
  const onCenterDwellRef = useRef(onCenterDwell);
  onCenterDwellRef.current = onCenterDwell;

  const emitPhase = useCallback((phase: GesturePhase, gesture: ActiveGesture | null) => {
    onPhaseChangeRef.current?.(phase, gesture);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      // Only primary button
      if (e.button !== 0) return;

      // Skip interactive elements
      const target = e.target as HTMLElement;
      if (target.closest(INTERACTIVE_SELECTORS)) return;

      const el = e.currentTarget as HTMLElement;

      // Only start gestures from the center region of the card
      if (edgeInset > 0) {
        const rect = el.getBoundingClientRect();
        const marginX = rect.width * edgeInset;
        const marginY = rect.height * edgeInset;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < marginX || x > rect.width - marginX || y < marginY || y > rect.height - marginY) {
          return;
        }
      }

      el.setPointerCapture(e.pointerId);

      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        committed: false,
        pointerId: e.pointerId,
        lockedDirection: null,
      };

      // Center-dwell (preset switcher) timer — armed whenever the pointer rests
      // in the cancel zone (from the initial press, or after returning from a
      // swipe); cleared on any drift out / teardown.
      let dwellTimer: ReturnType<typeof setTimeout> | null = null;
      const clearDwell = () => {
        if (dwellTimer != null) {
          clearTimeout(dwellTimer);
          dwellTimer = null;
        }
      };

      // Enter pending phase
      const pendingGesture: ActiveGesture = {
        type: 'swipe',
        phase: 'pending',
        direction: 'right', // placeholder until movement determines direction
        distance: 0,
        dx: 0,
        dy: 0,
      };
      setActiveGesture(pendingGesture);
      emitPhase('pending', pendingGesture);

      const cleanup = () => {
        clearDwell();
        el.removeEventListener('pointermove', handleMove);
        el.removeEventListener('pointerup', handleUp);
        el.removeEventListener('pointercancel', handleUp);
        document.removeEventListener('keydown', handleKeyDown);
      };

      // Dwell elapsed: end the gesture as a clean no-op and hand off to the
      // caller (the press is still physically down; the caller's UI takes over).
      const fireDwell = () => {
        const state = stateRef.current;
        dwellTimer = null;
        try {
          el.releasePointerCapture(state.pointerId);
        } catch {
          /* capture may already be gone; ignore */
        }
        cleanup();
        state.committed = false;
        state.pointerId = -1;
        setActiveGesture(null);
        emitPhase('idle', null);
        // Suppress the click that would otherwise follow the pointerup.
        gestureConsumed.current = true;
        requestAnimationFrame(() => { gestureConsumed.current = false; });
        onCenterDwellRef.current?.({ x: state.startX, y: state.startY });
      };
      const armDwell = () => {
        if (!onCenterDwellRef.current || dwellTimer != null) return;
        dwellTimer = setTimeout(fireDwell, centerDwellMs);
      };

      const handleMove = (ev: PointerEvent) => {
        const state = stateRef.current;
        const dx = ev.clientX - state.startX;
        const dy = ev.clientY - state.startY;
        const distance = Math.hypot(dx, dy);

        // Center-dwell preset switcher (opt-in). Keep a single-shot timer armed
        // whenever the pointer rests inside the cancel zone — whether that's the
        // initial press or a drag back after a swipe. Any drift out disarms it,
        // so it only fires on a steady hold.
        if (onCenterDwellRef.current) {
          if (distance <= threshold * 0.7) {
            armDwell();
          } else {
            clearDwell();
          }
        }

        // Sub-threshold return: if committed but dragged back close to start,
        // revert to pending (hysteresis at 0.7× threshold prevents oscillation)
        if (state.committed && distance <= threshold * 0.7) {
          state.committed = false;
          state.lockedDirection = null;
          const gesture: ActiveGesture = {
            type: 'swipe',
            phase: 'pending',
            direction: resolveDirection(dx, dy),
            distance,
            dx,
            dy,
          };
          setActiveGesture(gesture);
          emitPhase('pending', gesture);
          return;
        }

        const wasCommitted = state.committed;
        if (!state.committed && distance > threshold) {
          state.committed = true;
          // Lock direction at commit so vertical adjustment doesn't flip it
          state.lockedDirection = resolveDirection(dx, dy);
        }

        const direction = state.lockedDirection ?? resolveDirection(dx, dy);

        const gesture: ActiveGesture = {
          type: 'swipe',
          phase: state.committed ? 'committed' : 'pending',
          direction,
          distance,
          dx,
          dy,
        };
        setActiveGesture(gesture);

        if (state.committed && !wasCommitted) {
          emitPhase('committed', gesture);
        }
      };

      const handleUp = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        cleanup();

        const wasCommitted = stateRef.current.committed;
        const dx = ev.clientX - stateRef.current.startX;
        const dy = ev.clientY - stateRef.current.startY;
        const distance = Math.hypot(dx, dy);
        const direction = stateRef.current.lockedDirection ?? resolveDirection(dx, dy);

        // Reset visual/gesture state FIRST so the overlay always unmounts,
        // even if the action handler below throws or has side effects that
        // would otherwise prevent the state update from landing.
        stateRef.current.committed = false;
        stateRef.current.pointerId = -1;
        setActiveGesture(null);
        emitPhase('idle', null);

        if (wasCommitted) {
          // Flag to suppress the synthetic click that fires after pointerup
          gestureConsumed.current = true;
          requestAnimationFrame(() => { gestureConsumed.current = false; });

          onGestureRef.current({ type: 'swipe', direction, distance, dx, dy });
        }
      };

      const handleKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          el.releasePointerCapture(stateRef.current.pointerId);
          cleanup();

          stateRef.current.committed = false;
          stateRef.current.pointerId = -1;
          setActiveGesture(null);
          emitPhase('idle', null);

          // Suppress the click that would follow the cancelled gesture
          gestureConsumed.current = true;
          requestAnimationFrame(() => { gestureConsumed.current = false; });
        }
      };

      el.addEventListener('pointermove', handleMove);
      el.addEventListener('pointerup', handleUp);
      el.addEventListener('pointercancel', handleUp);
      document.addEventListener('keydown', handleKeyDown);

      // Arm the dwell timer from the initial press so a still press-and-hold
      // (no movement, hence no pointermove) still opens the switcher. A swipe
      // disarms it as soon as the pointer leaves the zone in handleMove.
      armDwell();
    },
    [enabled, threshold, edgeInset, emitPhase, centerDwellMs],
  );

  return {
    gestureHandlers: { onPointerDown },
    activeGesture,
    gestureConsumed,
  };
}
