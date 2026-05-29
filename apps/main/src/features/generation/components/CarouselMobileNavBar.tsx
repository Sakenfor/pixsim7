/**
 * CarouselMobileNavBar — always-visible bottom-center control bar for the
 * QuickGen carousel asset card (desktop + mobile alike).
 *
 * Replaces the older split affordances (hover edge ‹/› chevrons + top-center
 * cohort/view pill + standalone slot stepper) with one consolidated pill:
 *
 *     «   Time ⌄ · 2/5   »
 *     │   └ center badge ┘  │
 *     └ slot prev/next ─────┘
 *
 * Two axes, two interaction styles:
 *   - SLOT / pool (which pooled asset, the `2/5` count): the OUTER double-
 *     chevrons (« ») step it; tapping the `2/5` opens the grid; the card image
 *     itself scroll/swipe-cycles slots too.
 *   - TIME / PROMPT cohort (swaps the current asset): the CENTER badge owns it
 *     — scroll-wheel / horizontal swipe / drag over the badge walks prev↔next,
 *     and a tap toggles Time ⇄ Prompt (or Single ⇄ Grid for a set slot). No
 *     dedicated chevrons; the badge stops wheel propagation so scrolling *on
 *     it* walks the cohort while scrolling the image cycles slots.
 *
 * Prev/next + commit for both axes route through `useInputSlotNavigation`, so
 * every surface (keys, wheel, swipe) stays in lockstep.
 *
 * Plan: `media-card-input-time-nav` (consolidated bottom-bar variant).
 */

import { useEffect, useRef } from 'react';

import { Icon } from '@lib/icons';

import type { AssetModel } from '@features/assets';
import type { AssetSetSlotRef } from '@features/generation';

import { CohortPill } from '@/components/media/inputSlotNavControls';
import { ViewModePill } from '@/components/media/inputSlotViewModePill';
import type { MediaCardQueueConfig } from '@/components/media/MediaCard';
import { MediaCardQueueNav } from '@/components/media/MediaCardQueueNav';
import { useInputSlotNavigation } from '@/components/media/useInputSlotNavigation';
import type { OperationType } from '@/types/operations';

export interface CarouselMobileNavBarProps {
  /** Pivot asset for the cohort badge. Null/undefined on the empty (virtual)
   *  slot — the bar then shows only the slot stepper, no cohort badge. */
  asset?: AssetModel | null;
  inputId?: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
  queue: MediaCardQueueConfig;
}

function SlotChevron({
  dir,
  onClick,
  label,
}: {
  dir: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-white/90 hover:text-white transition-colors"
      title={label}
      aria-label={label}
    >
      {/* Double chevron = step between pooled assets. */}
      <Icon name={dir === 'left' ? 'chevronsLeft' : 'chevronsRight'} size={14} />
    </button>
  );
}

/**
 * Center badge that both displays and drives the time/prompt cohort:
 *   - tap → toggle cohort (delegated to the inner CohortPill / ViewModePill)
 *   - scroll-wheel / horizontal swipe → walk prev↔next
 * A drag past threshold suppresses the trailing click so a swipe doesn't also
 * toggle the cohort.
 */
function CohortNavBadge({
  asset,
  inputId,
  operationType,
  assetSetRef,
}: {
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
}) {
  const { prev, next, commit } = useInputSlotNavigation({ asset, inputId, operationType, assetSetRef });
  const ref = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);

  // Wheel → walk. preventDefault + stopPropagation so the card's slot-cycling
  // wheel handler doesn't also fire while the pointer is over the badge.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const target = e.deltaY > 0 ? next : prev;
      e.preventDefault();
      e.stopPropagation();
      if (target) commit(target);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [prev, next, commit]);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragged.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current !== null && Math.abs(e.clientX - startX.current) > 8) {
      dragged.current = true;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 24) return; // tap → let the inner toggle fire
    const target = dx < 0 ? next : prev; // swipe left → next, right → prev
    if (target) commit(target);
  };
  // Swallow the click that follows a drag so a swipe doesn't also toggle.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  };

  return (
    <div
      ref={ref}
      className="flex items-center touch-pan-y cursor-pointer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClickCapture={onClickCapture}
      title="Scroll or swipe to walk neighbors · tap to switch"
    >
      {assetSetRef ? (
        <ViewModePill inputId={inputId} bare />
      ) : (
        <CohortPill asset={asset} operationType={operationType} bare />
      )}
    </div>
  );
}

export function CarouselMobileNavBar({
  asset,
  inputId,
  operationType,
  assetSetRef,
  queue,
}: CarouselMobileNavBarProps) {
  const showSlots = queue.totalCount > 1;
  // No asset on the empty (virtual) slot → no cohort to walk, just the stepper.
  const hasCohort = !!asset && !!inputId;
  if (!hasCohort && !showSlots) return null;

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 rounded-full bg-black/70 backdrop-blur-sm px-1.5 py-1 shadow-md">
      {/* Slot prev (pool) */}
      {showSlots && (
        <SlotChevron dir="left" onClick={() => queue.onPrev?.()} label="Previous asset (pool)" />
      )}

      {/* Center: cohort badge (scroll/swipe to walk, tap to toggle) + slot count */}
      <div className="flex items-center gap-1.5 px-1">
        {asset && inputId && (
          <CohortNavBadge
            asset={asset}
            inputId={inputId}
            operationType={operationType}
            assetSetRef={assetSetRef}
          />
        )}
        {showSlots && (
          <>
            {hasCohort && <span className="h-3 w-px bg-white/20" aria-hidden />}
            <MediaCardQueueNav queue={queue} embedded variant="counter" />
          </>
        )}
      </div>

      {/* Slot next (pool) */}
      {showSlots && (
        <SlotChevron dir="right" onClick={() => queue.onNext?.()} label="Next asset (pool)" />
      )}
    </div>
  );
}
