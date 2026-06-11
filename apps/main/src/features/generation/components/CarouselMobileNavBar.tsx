/**
 * CarouselMobileNavBar — always-visible bottom-center control bar for the
 * QuickGen carousel asset card (desktop + mobile alike).
 *
 * Both axes (slot pool + time/prompt cohort) use the same vertical-chevron
 * pattern: each axis's icon/count sits between green up/down chevrons that
 * are clickable for prev/next and bounce on commit. No more horizontal outer
 * `«»` chevrons; the bar reads as two stacked "scrub columns":
 *
 *          ⌃                 ⌃
 *     [ clock · Time   ·   2 / 3 ]
 *          ⌄                 ⌄
 *      cohort scrub        slot scrub
 *
 * Toggles (Time⇄Prompt, Single⇄Grid for set slots, grid popup for slot count)
 * remain on the center icons/labels themselves; the chevrons walk neighbors.
 * The cohort badge still accepts scroll-wheel / horizontal swipe over its
 * column (the spatial split — badge scroll = cohort, card scroll = slot — is
 * preserved).
 *
 * Plan: `media-card-input-time-nav` (consolidated bottom-bar variant).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
  /**
   * When true, render just the pill (no absolute positioning / z-index) so an
   * outer container — e.g. MediaCard's overlay widget system — can position
   * it. The asset MediaCard branch uses this so the bar joins the same z/
   * pointer-event stack as the play widget and badges. The virtual (empty)
   * slot still uses the standalone (absolute) form since it has no MediaCard.
   */
  inline?: boolean;
}

/**
 * Center badge that both displays and drives the time/prompt cohort:
 *   - tap chevron → walk prev/next
 *   - tap label/icon OR hold (long-press) anywhere on the badge → toggle cohort
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
  // Tick bumps on each commit; the scrollHint chevrons key off it to re-trigger
  // the one-shot bounce animation per commit.
  const [tick, setTick] = useState(0);
  const [lastDir, setLastDir] = useState<'prev' | 'next' | null>(null);

  const commitDir = useCallback(
    (target: AssetModel, dir: 'prev' | 'next') => {
      setLastDir(dir);
      setTick((t) => t + 1);
      commit(target);
    },
    [commit],
  );

  // Wheel → walk. preventDefault + stopPropagation so the card's slot-cycling
  // wheel handler doesn't also fire while the pointer is over the badge.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const dir = e.deltaY > 0 ? 'next' : 'prev';
      const target = dir === 'next' ? next : prev;
      e.preventDefault();
      e.stopPropagation();
      if (target) commitDir(target, dir);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [prev, next, commitDir]);

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
    const dir = dx < 0 ? 'next' : 'prev'; // swipe left → next, right → prev
    const target = dir === 'next' ? next : prev;
    if (target) commitDir(target, dir);
  };
  // Swallow the click that follows a drag so a swipe doesn't also toggle.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  };

  const scrollHint = {
    dir: lastDir,
    tick,
    onPrev: prev ? () => commitDir(prev, 'prev') : undefined,
    onNext: next ? () => commitDir(next, 'next') : undefined,
  };

  return (
    <div
      ref={ref}
      className="flex items-center gap-1 touch-pan-y cursor-pointer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClickCapture={onClickCapture}
      title="Tap chevrons to walk · scroll/swipe to walk · hold or tap label to switch"
    >
      {assetSetRef ? (
        <ViewModePill inputId={inputId} bare scrollHint={scrollHint} />
      ) : (
        <CohortPill asset={asset} operationType={operationType} bare scrollHint={scrollHint} />
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
  inline = false,
}: CarouselMobileNavBarProps) {
  // Slot dir/tick — wraps queue.onPrev/onNext so the slot chevrons (in
  // MediaCardQueueNav scrubHint) bounce on each slot commit, sister to the
  // cohort badge's own dir/tick tracking inside CohortNavBadge.
  // (Declared above the early return so hook order stays stable.)
  const [slotTick, setSlotTick] = useState(0);
  const [slotDir, setSlotDir] = useState<'prev' | 'next' | null>(null);

  const showSlots = queue.totalCount > 1;
  // No asset on the empty (virtual) slot → no cohort to walk, just the stepper.
  const hasCohort = !!asset && !!inputId;
  if (!hasCohort && !showSlots) return null;

  // Non-inline (virtual slot): bar positions itself directly. The number
  // matches the asset-branch overlay widget's effective `bottom: 14px` (from
  // position.ts negating the -14 offset), so switching between the asset slot
  // and the empty slot doesn't make the bar visually jump.
  const positionClass = inline
    ? ''
    : 'absolute bottom-[14px] left-1/2 -translate-x-1/2 z-30 ';

  const slotPrev = queue.onPrev
    ? () => {
        setSlotDir('prev');
        setSlotTick((t) => t + 1);
        queue.onPrev?.();
      }
    : undefined;
  const slotNext = queue.onNext
    ? () => {
        setSlotDir('next');
        setSlotTick((t) => t + 1);
        queue.onNext?.();
      }
    : undefined;

  return (
    <div className={`cq-scale-down ${positionClass}flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-1.5 py-1 shadow-md`}>
      {/* Cohort scrub column (icon + clickable up/down chevrons + label toggle) */}
      {asset && inputId && (
        <CohortNavBadge
          asset={asset}
          inputId={inputId}
          operationType={operationType}
          assetSetRef={assetSetRef}
        />
      )}
      {/* Slot scrub column (count + clickable up/down chevrons + grid popup) */}
      {showSlots && (
        <>
          {hasCohort && <span className="h-3 w-px bg-white/20" aria-hidden />}
          <MediaCardQueueNav
            queue={queue}
            embedded
            variant="counter"
            scrubHint={{ dir: slotDir, tick: slotTick, onPrev: slotPrev, onNext: slotNext }}
          />
        </>
      )}
    </div>
  );
}
