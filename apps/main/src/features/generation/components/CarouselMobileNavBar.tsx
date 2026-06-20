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

import { useState } from 'react';

import type { AssetModel } from '@features/assets';
import type { AssetSetSlotRef } from '@features/generation';

import { CohortNavBadge } from '@/components/media/inputSlotNavControls';
import type { MediaCardQueueConfig } from '@/components/media/MediaCard';
import { MediaCardQueueNav } from '@/components/media/MediaCardQueueNav';
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
