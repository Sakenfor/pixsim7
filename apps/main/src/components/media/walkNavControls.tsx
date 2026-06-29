/**
 * Shared building blocks for the "walk + toggle" nav badges used across media
 * cards. One source of truth so chevron sizing/spacing/colour and the touch
 * layout only ever get tuned in this file.
 *
 * - `WalkChevron` — a single prev/next chevron button. Coarse pointers get a
 *   wider tap area; the chevron matching the last commit direction plays a
 *   one-shot bounce (keyed off `tick`). Used by CohortPill, ViewModePill and
 *   MediaCardQueueNav's pool stepper.
 * - `WalkTogglePill` — the full cohort-style badge: prev/next chevrons + a
 *   non-interactive icon indicator + a label that toggles. Touch lays it out
 *   vertically with the chevrons stacked over the icon (so the label text is a
 *   clean tap target) plus a hold-anywhere-to-toggle fallback; desktop keeps
 *   the compact chevron-column-beside-label pill.
 *
 * Plans: `media-card-input-time-nav`, `same-prompt-cohort-nav`,
 * `set-slot-walk-and-grid`.
 */

import { useCallback, useEffect, useRef } from 'react';

import { Icon, type IconName } from '@lib/icons';

import { useIsCoarsePointer } from '@/lib/ui/coarsePointer';

// Hold this long (ms) anywhere on a WalkTogglePill badge to toggle on touch.
const LONG_PRESS_MS = 400;
// A pointer moving more than this (px) before the timer fires is treated as a
// swipe, not a hold, and cancels the pending toggle.
const LONG_PRESS_MOVE_TOLERANCE = 10;

// Bare (sits inside a parent bar that supplies the background) vs standalone
// badge. Shared by every WalkTogglePill host so the chrome stays identical.
const BARE_CLASS = `
  flex items-center gap-1
  text-white/90 text-[10px] font-medium
  hover:text-white
  transition-colors
`;
const BADGE_CLASS = `
  flex items-center gap-1
  h-6 px-2 rounded-full
  bg-black/55 text-white/90 text-[10px] font-medium
  backdrop-blur-sm shadow-md
  hover:bg-black/75 hover:text-white
  transition-colors
`;

// ─────────────────────────────────────────────────────────────────────────────
// WalkChevron — one prev/next chevron button
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkChevronProps {
  dir: 'prev' | 'next';
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  /** Last committed walk direction — bounces the matching chevron. */
  lastDir?: 'prev' | 'next' | null;
  /** Bump per commit to re-trigger the one-shot bounce animation. */
  tick?: number;
  title: string;
  ariaLabel: string;
  /** Disabled-chevron dim — hosts vary (opacity-50 vs opacity-30). */
  disabledOpacityClass?: string;
}

export function WalkChevron({
  dir,
  onClick,
  disabled,
  lastDir,
  tick,
  title,
  ariaLabel,
  disabledOpacityClass = 'disabled:opacity-50',
}: WalkChevronProps) {
  const isCoarse = useIsCoarsePointer();
  const active = lastDir === dir;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      // Touch: widen the tap area (px-2) while staying tight vertically
      // (-my-0.5) so the column doesn't grow tall.
      className={`${isCoarse ? 'px-2 -my-0.5' : '-my-0.5'} flex items-center justify-center text-emerald-400 hover:text-emerald-300 ${disabledOpacityClass} disabled:cursor-default transition-colors`}
      title={title}
      aria-label={ariaLabel}
    >
      {/* Keying the glyph span by `tick` remounts it on each commit, re-firing
          the one-shot bounce on the chevron matching the last walk direction. */}
      <span key={active ? `t${tick}` : 'idle'} className={active ? 'animate-bounce-once' : ''}>
        <Icon name={dir === 'prev' ? 'chevronUp' : 'chevronDown'} size={isCoarse ? 16 : 10} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WalkTogglePill — chevrons + icon indicator + label toggle
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkTogglePillProps {
  /** Drop the pill background/padding so it can sit inside a parent bar. */
  bare?: boolean;
  /** Cohort/view icon — rendered as a non-interactive indicator only. */
  icon: IconName;
  /** Toggle label, e.g. "Source"/"Time" or "Grid"/"Single". */
  label: string;
  toggleTitle: string;
  onToggle: () => void;
  /** Disable the toggle (e.g. cohort with no source signal). Walk stays live. */
  toggleDisabled?: boolean;
  groupAriaLabel: string;
  toggleAriaLabel: string;
  scrollHint: {
    dir: 'prev' | 'next' | null;
    tick: number;
    onPrev?: () => void;
    onNext?: () => void;
  };
  /** Title + aria-label for the prev / next chevrons. */
  prevLabel: string;
  nextLabel: string;
  /** Disabled-chevron dim, forwarded to WalkChevron. */
  disabledChevronOpacityClass?: string;
}

export function WalkTogglePill({
  bare = true,
  icon,
  label,
  toggleTitle,
  onToggle,
  toggleDisabled = false,
  groupAriaLabel,
  toggleAriaLabel,
  scrollHint,
  prevLabel,
  nextLabel,
  disabledChevronOpacityClass,
}: WalkTogglePillProps) {
  const isCoarse = useIsCoarsePointer();

  // Hold-anywhere-to-toggle (touch). The tiny icon/label are awkward to hit
  // precisely on a phone, so a hold over the whole badge gives a large target
  // while quick taps on the chevrons still walk prev/next. The trailing click
  // of a hold is swallowed (onClickCaptureSuppress) so it can't double-fire.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  }, []);
  // Cancel any pending hold on unmount so the timer can't fire after teardown.
  useEffect(() => clearLongPress, [clearLongPress]);

  const onPressDown = (e: React.PointerEvent) => {
    if (toggleDisabled) return; // nothing to switch to
    pressStart.current = { x: e.clientX, y: e.clientY };
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      longPressTimer.current = null;
      onToggle();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15); // light haptic tick to confirm the hold registered
      }
    }, LONG_PRESS_MS);
  };
  // A drag past threshold is a swipe (handled by a parent nav bar), not a hold
  // — cancel the pending toggle so swipe-to-walk doesn't also switch.
  const onPressMove = (e: React.PointerEvent) => {
    const s = pressStart.current;
    if (!s) return;
    if (
      Math.abs(e.clientX - s.x) > LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(e.clientY - s.y) > LONG_PRESS_MOVE_TOLERANCE
    ) {
      clearLongPress();
    }
  };
  const onClickCaptureSuppress = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false;
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    scrollHint.onPrev?.();
  };
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    scrollHint.onNext?.();
  };
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!toggleDisabled) onToggle();
  };

  const className = bare ? BARE_CLASS : BADGE_CLASS;

  const containerProps = {
    role: 'group' as const,
    'aria-label': groupAriaLabel,
    title: toggleDisabled ? toggleTitle : `${toggleTitle} · hold to switch`,
    onPointerDown: onPressDown,
    onPointerMove: onPressMove,
    onPointerUp: clearLongPress,
    onPointerCancel: clearLongPress,
    onClickCapture: onClickCaptureSuppress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const prevChevron = (
    <WalkChevron
      dir="prev"
      onClick={handlePrev}
      disabled={!scrollHint.onPrev}
      lastDir={scrollHint.dir}
      tick={scrollHint.tick}
      title={prevLabel}
      ariaLabel={prevLabel}
      disabledOpacityClass={disabledChevronOpacityClass}
    />
  );
  const nextChevron = (
    <WalkChevron
      dir="next"
      onClick={handleNext}
      disabled={!scrollHint.onNext}
      lastDir={scrollHint.dir}
      tick={scrollHint.tick}
      title={nextLabel}
      ariaLabel={nextLabel}
      disabledOpacityClass={disabledChevronOpacityClass}
    />
  );
  const indicator = (
    <span
      className={`flex items-center justify-center ${toggleDisabled ? 'opacity-30' : ''}`}
      aria-hidden="true"
    >
      <Icon name={icon} size={12} />
    </span>
  );
  const labelButton = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleToggle}
      disabled={toggleDisabled}
      className={`gen-scrub-label ${toggleDisabled ? 'opacity-30 cursor-default' : 'cursor-pointer'}`.trim()}
      title={toggleTitle}
      aria-label={toggleAriaLabel}
    >
      {label}
    </button>
  );

  // Touch: stack vertically and left-align so the chevrons sit above/below the
  // icon (not over the middle of "◷ Label"), leaving the label text a clean
  // tap target. The label height between the chevrons makes prev/next hard to
  // mis-tap; the icon is a non-interactive indicator so tapping it does nothing.
  if (isCoarse) {
    return (
      <div className={`${className} select-none !flex-col !items-start !gap-0`} {...containerProps}>
        {prevChevron}
        <span className="flex items-center gap-1 px-1">
          {indicator}
          {labelButton}
        </span>
        {nextChevron}
      </div>
    );
  }

  // Desktop: compact horizontal pill — a tight vertical chevron column (cohort
  // icon a non-interactive indicator between them) beside the label.
  return (
    <div className={`${className} select-none`} {...containerProps}>
      <span className="flex flex-col items-center leading-none">
        {prevChevron}
        {indicator}
        {nextChevron}
      </span>
      {labelButton}
    </div>
  );
}
