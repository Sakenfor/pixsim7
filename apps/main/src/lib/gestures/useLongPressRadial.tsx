import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

import { GestureRadialMenu, type RadialArms } from './GestureRadialMenu';
import { useGestureRadialStore } from './useGestureRadialStore';
import type { GestureDirection } from './useMouseGesture';

const LONG_PRESS_MS = 450;
const SLOP_PX = 12;
const INTERACTIVE =
  'button, a, input, select, textarea, [role="button"], [data-gen-action-popover="true"], [data-overlay-interactive="true"]';

export interface UseLongPressRadialOptions {
  /** Stable numeric key — only one card's radial may be open at a time. */
  id: number;
  /** Mobile-only: the surface is enabled and has at least one mapped direction. */
  enabled: boolean;
  arms: RadialArms;
  commit: (direction: GestureDirection, tierIndex: number) => void;
  /**
   * Element to center the cross on. When omitted the cross opens at the
   * press point (better for fullscreen surfaces like the viewer).
   */
  anchor?: RefObject<HTMLElement | null>;
  /** Fired the moment the menu opens — e.g. to cancel a pending tap chain. */
  onOpen?: () => void;
  /**
   * Optional swipe-preset switcher for the radial's center pivot (mobile analog
   * of the desktop center-dwell switcher). Passed straight through to
   * `GestureRadialMenu`; omit it to keep the center as a plain ✕ dismiss.
   */
  presetSwitch?: { label: string; count: number; onCycle: () => void };
}

export interface UseLongPressRadialResult {
  /** Wire onto the surface's pointerdown (compose with any existing handler). */
  onPointerDown: (event: { pointerType: string; pointerId: number; clientX: number; clientY: number; target: EventTarget | null }) => void;
  radialOpen: boolean;
  /** Render this; it portals to <body> when open. */
  node: ReactNode;
}

/**
 * Long-press → radial gesture menu, factored out of MediaCard so any surface
 * (gallery card, recents strip, viewer, …) can opt in with one pointerdown wire
 * + rendering `node`. Touch disables the desktop swipe (it fights native
 * scroll), so this is the mobile entry point to the *same* per-surface
 * direction mappings. A move past slop or an early lift cancels back into the
 * normal tap/scroll path; the held pointer is handed to the menu for the
 * slide-and-release pick.
 */
export function useLongPressRadial({
  id,
  enabled,
  arms,
  commit,
  anchor,
  onOpen,
  presetSwitch,
}: UseLongPressRadialOptions): UseLongPressRadialResult {
  const openId = useGestureRadialStore((s) => s.openId);
  const open = useGestureRadialStore((s) => s.open);
  const close = useGestureRadialStore((s) => s.close);
  const radialOpen = openId === id;

  const timerRef = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    detachRef.current?.();
    detachRef.current = null;
  }, []);

  // Latest options for the deferred timer closure without re-creating onPointerDown.
  const latest = useRef({ id, enabled, anchor, onOpen, open });
  latest.current = { id, enabled, anchor, onOpen, open };

  const onPointerDown = useCallback<UseLongPressRadialResult['onPointerDown']>(
    (event) => {
      cancel();
      if (!latest.current.enabled || event.pointerType === 'mouse') return;
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE)) return;

      const pointerId = event.pointerId;
      const x0 = event.clientX;
      const y0 = event.clientY;

      // Pre-fire watchers: a scroll/drag or early lift aborts the long-press.
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP_PX) cancel();
      };
      const onUpCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) cancel();
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUpCancel, { passive: true });
      window.addEventListener('pointercancel', onUpCancel, { passive: true });
      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUpCancel);
        window.removeEventListener('pointercancel', onUpCancel);
      };

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        // The menu takes ownership of the still-held pointer from here.
        detachRef.current?.();
        detachRef.current = null;
        const o = latest.current;
        const rect = o.anchor?.current?.getBoundingClientRect();
        centerRef.current = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: x0, y: y0 };
        pointerRef.current = pointerId;
        o.onOpen?.();
        o.open(o.id);
      }, LONG_PRESS_MS);
    },
    [cancel],
  );

  // Clean up a pending press on unmount, and clear a stale open flag if this
  // card unmounts (e.g. virtualization recycle) while its menu is open.
  useEffect(
    () => () => {
      cancel();
      useGestureRadialStore.getState().close(id);
    },
    [cancel, id],
  );

  const node = radialOpen ? (
    <GestureRadialMenu
      arms={arms}
      center={centerRef.current}
      pointerId={pointerRef.current}
      onCommit={commit}
      onDismiss={() => close(id)}
      presetSwitch={presetSwitch}
    />
  ) : null;

  return { onPointerDown, radialOpen, node };
}
