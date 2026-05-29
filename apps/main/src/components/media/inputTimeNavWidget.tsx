/**
 * Input-slot navigation widgets
 *
 * Hover-revealed `‹` / `›` chevrons rendered at the vertical-center edges of
 * an input-slot MediaCard, plus a top-center pill that picks the navigation
 * mode for that slot. The chevrons walk one of two cohorts:
 *
 *   - **time / prompt cohort** (default): `useAssetSequence` over `created_at`
 *     filtered by media_type plus the per-operation cohort (`time` or
 *     `prompt`, picked via `<CohortPill>`).
 *   - **set cohort** (when the slot has an `assetSetRef`): the resolved set
 *     members, walked in order. Click pins via `pinAssetSetMember`
 *     (mode='locked' + lockedAssetId + display swap atomic). The pill turns
 *     into `<ViewModePill>` (Single ⇄ Grid).
 *
 * `useInputSlotNavigation` is the single source of truth for prev/next/commit;
 * `[`/`]` keys, wheel, and swipe gestures use the same hook so every
 * affordance stays in lockstep and shares one neighbor lookup.
 *
 * `ChevronButton` + `CohortPill` live in `inputSlotNavControls.tsx` so the
 * mobile `CarouselMobileNavBar` can reuse the same affordances in a compact
 * bottom bar.
 *
 * Plans: `media-card-input-time-nav` (time chevrons + cohort pill base),
 * `same-prompt-cohort-nav` (prompt cohort), `set-slot-walk-and-grid`
 * (set chevron walk + Single/Grid pill).
 *
 * Gated by `presetCapabilities.showsInputTimeNav` at the consumer level —
 * gallery / picker cards must not enable this (they don't own a slot id).
 */

import type { OverlayWidget } from '@lib/ui/overlay';

import type { AssetModel } from '@features/assets';
import type { AssetSetSlotRef } from '@features/generation';

import type { OperationType } from '@/types/operations';

import { ChevronButton, CohortPill } from './inputSlotNavControls';
import { ViewModePill } from './inputSlotViewModePill';
import type { MediaCardOverlayData } from './mediaCardWidgets';

// ─────────────────────────────────────────────────────────────────────────────
// Widget factory
// ─────────────────────────────────────────────────────────────────────────────

export interface InputTimeNavWidgetArgs {
  /** Pivot asset filling the slot (must be a fresh AssetModel ref). */
  asset: AssetModel;
  /** Slot identifier (InputItem.id) — preserved across the swap. */
  inputId: string;
  /** Operation bucket holding the slot. */
  operationType: OperationType;
  /**
   * Set linkage, when present. Switches chevron cohort to set members and
   * swaps the top-center pill from Time/Prompt to Single/Grid.
   */
  assetSetRef: AssetSetSlotRef | undefined;
}

/**
 * Build the prev + next chevron widgets and the cohort/view-mode pill for
 * an input-slot MediaCard. Spread into `customWidgets` from the slot's
 * call-site (typically `buildSlotExtraWidgets`).
 */
export function createInputTimeNavWidgets(
  args: InputTimeNavWidgetArgs,
): OverlayWidget<MediaCardOverlayData>[] {
  const { asset, inputId, operationType, assetSetRef } = args;
  return [
    {
      id: 'input-time-nav-prev',
      type: 'custom',
      position: { anchor: 'center-left', offset: { x: 4, y: 0 } },
      visibility: { trigger: 'hover-container' },
      priority: 30,
      interactive: true,
      handlesOwnInteraction: true,
      render: () => (
        <ChevronButton
          side="left"
          asset={asset}
          inputId={inputId}
          operationType={operationType}
          assetSetRef={assetSetRef}
        />
      ),
    },
    {
      id: 'input-time-nav-next',
      type: 'custom',
      position: { anchor: 'center-right', offset: { x: -4, y: 0 } },
      visibility: { trigger: 'hover-container' },
      priority: 30,
      interactive: true,
      handlesOwnInteraction: true,
      render: () => (
        <ChevronButton
          side="right"
          asset={asset}
          inputId={inputId}
          operationType={operationType}
          assetSetRef={assetSetRef}
        />
      ),
    },
    {
      id: 'input-time-nav-pill',
      type: 'custom',
      // Top-center, between the two edge chevrons it controls. Slot/set/mask
      // badges live top-left and the generation pill is bottom-center, so
      // this lane is clear.
      position: { anchor: 'top-center', offset: { x: 0, y: 4 } },
      visibility: { trigger: 'hover-container' },
      priority: 30,
      interactive: true,
      handlesOwnInteraction: true,
      render: () =>
        assetSetRef
          ? <ViewModePill inputId={inputId} />
          : <CohortPill asset={asset} operationType={operationType} />,
    },
  ];
}
