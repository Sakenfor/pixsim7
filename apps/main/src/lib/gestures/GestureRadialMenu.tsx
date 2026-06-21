import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { GestureDirection } from './useMouseGesture';

export interface RadialArmTier {
  actionId: string;
  label: string;
}

/** Per-direction cascade tiers, already stripped of `none`. */
export type RadialArms = Record<GestureDirection, RadialArmTier[]>;

export interface GestureRadialMenuProps {
  arms: RadialArms;
  /** Card center in viewport (client) coordinates — the cross pivots here. */
  center: { x: number; y: number };
  /**
   * The pointer still held down from the long-press, if any. When set, the menu
   * opens in "slide" mode: keep dragging toward an arm and release to fire.
   * Releasing in the center hands off to "tap" mode (lift, then tap an arm).
   */
  pointerId: number | null;
  onCommit: (direction: GestureDirection, tierIndex: number) => void;
  onDismiss: () => void;
}

const DIRECTIONS: GestureDirection[] = ['up', 'down', 'left', 'right'];
const ARROW: Record<GestureDirection, string> = { up: '↑', down: '↓', left: '←', right: '→' };

// Radius of the center dead-zone (cancel / tap-handoff) and how far each extra
// cascade tier sits along an arm. Tuned for thumb travel on a phone.
const DEAD_ZONE_PX = 30;
const TIER_STEP_PX = 46;
// How far each arm button is offset from the pivot.
const ARM_OFFSET_PX = 74;
// Keep the whole cross on screen.
const EDGE_MARGIN_PX = ARM_OFFSET_PX + 48;

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      /* feature-detect only; ignore unsupported */
    }
  }
}

function resolveDir(dx: number, dy: number): GestureDirection {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

const armTransform: Record<GestureDirection, string> = {
  up: `translate(-50%, -50%) translateY(-${ARM_OFFSET_PX}px)`,
  down: `translate(-50%, -50%) translateY(${ARM_OFFSET_PX}px)`,
  left: `translate(-50%, -50%) translateX(-${ARM_OFFSET_PX}px)`,
  right: `translate(-50%, -50%) translateX(${ARM_OFFSET_PX}px)`,
};

export function GestureRadialMenu({ arms, center, pointerId, onCommit, onDismiss }: GestureRadialMenuProps) {
  const [mode, setMode] = useState<'slide' | 'tap'>(pointerId != null ? 'slide' : 'tap');
  // Slide highlight: which arm + tier the finger is currently over.
  const [active, setActive] = useState<{ dir: GestureDirection; tier: number } | null>(null);
  // Tap mode: a multi-tier arm the user tapped to expand into pickable tiers.
  const [expandedDir, setExpandedDir] = useState<GestureDirection | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;

  // Clamp the pivot so no arm renders off the viewport edge.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const cx = Math.min(Math.max(center.x, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, vw - EDGE_MARGIN_PX));
  const cy = Math.min(Math.max(center.y, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, vh - EDGE_MARGIN_PX));

  useEffect(() => {
    vibrate(10);
  }, []);

  // Slide-mode pointer tracking. Lives only while a pointer is held; on release
  // it either fires the highlighted arm or hands off to tap mode.
  useEffect(() => {
    if (mode !== 'slide' || pointerId == null) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist <= DEAD_ZONE_PX) {
        setActive(null);
        return;
      }
      const dir = resolveDir(dx, dy);
      const tiers = arms[dir];
      if (!tiers || tiers.length === 0) {
        setActive(null);
        return;
      }
      const tier = Math.min(tiers.length - 1, Math.floor((dist - DEAD_ZONE_PX) / TIER_STEP_PX));
      setActive((prev) => (prev && prev.dir === dir && prev.tier === tier ? prev : { dir, tier }));
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const a = activeRef.current;
      if (a) {
        vibrate(14);
        onCommit(a.dir, a.tier);
        onDismiss();
      } else {
        // Released in the center → keep open for deliberate tapping.
        setMode('tap');
      }
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      onDismiss();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [mode, pointerId, cx, cy, arms, onCommit, onDismiss]);

  // Dismiss on Escape or any scroll (the anchored pivot would otherwise drift).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    const onScroll = () => onDismiss();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    };
  }, [onDismiss]);

  const handleArmTap = (dir: GestureDirection) => {
    const tiers = arms[dir];
    if (!tiers || tiers.length === 0) return;
    if (tiers.length === 1) {
      vibrate(14);
      onCommit(dir, 0);
      onDismiss();
    } else {
      setExpandedDir((prev) => (prev === dir ? null : dir));
    }
  };

  const handleTierTap = (dir: GestureDirection, tier: number) => {
    vibrate(14);
    onCommit(dir, tier);
    onDismiss();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] touch-none select-none"
      // Tap backdrop (tap mode) dismisses. In slide mode the window listeners own
      // the gesture, so swallow pointer events here to keep them off the card.
      onPointerDown={(e) => {
        e.stopPropagation();
        if (mode === 'tap') onDismiss();
      }}
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      <div
        className="absolute"
        style={{ left: cx, top: cy }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Center pivot — tap to dismiss in tap mode. */}
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onDismiss()}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900/85 text-white/70 shadow-lg ring-1 ring-white/15"
          aria-label="Close gesture menu"
        >
          <span className="text-lg leading-none">✕</span>
        </button>

        {DIRECTIONS.map((dir) => {
          const tiers = arms[dir];
          if (!tiers || tiers.length === 0) return null;
          const isActiveArm = active?.dir === dir;
          const isExpanded = expandedDir === dir;
          const primary = tiers[0];
          const activeTierIdx = isActiveArm ? active.tier : 0;
          const shownLabel = tiers[Math.min(activeTierIdx, tiers.length - 1)]?.label ?? primary.label;

          return (
            <div
              key={dir}
              className="absolute"
              style={{ left: 0, top: 0, transform: armTransform[dir] }}
            >
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => handleArmTap(dir)}
                  className={[
                    'flex min-w-[68px] max-w-[120px] flex-col items-center gap-0.5 rounded-xl px-2.5 py-2 shadow-lg ring-1 transition',
                    isActiveArm
                      ? 'bg-emerald-500 text-white ring-emerald-300 scale-105'
                      : 'bg-neutral-900/90 text-white ring-white/15',
                  ].join(' ')}
                >
                  <span className="text-base leading-none opacity-80">{ARROW[dir]}</span>
                  <span className="text-center text-[11px] font-medium leading-tight">{shownLabel}</span>
                  {tiers.length > 1 && !isExpanded && (
                    <span className="mt-0.5 flex items-center gap-0.5">
                      {tiers.map((_, i) => (
                        <span
                          key={i}
                          className={[
                            'h-1 w-1 rounded-full',
                            isActiveArm && i === active.tier ? 'bg-white' : 'bg-white/40',
                          ].join(' ')}
                        />
                      ))}
                      {!isActiveArm && <span className="ml-1 text-[9px] text-white/60">+{tiers.length - 1}</span>}
                    </span>
                  )}
                </button>

                {/* Tap mode: expanded tier picker for multi-tier arms. */}
                {isExpanded && mode === 'tap' && (
                  <div className="flex flex-col items-stretch gap-1 rounded-lg bg-neutral-900/95 p-1 shadow-lg ring-1 ring-white/15">
                    {tiers.map((t, i) => (
                      <button
                        key={t.actionId + i}
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => handleTierTap(dir, i)}
                        className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500"
                      >
                        {i + 1}. {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
