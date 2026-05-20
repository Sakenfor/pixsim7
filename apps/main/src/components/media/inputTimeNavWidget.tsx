/* eslint-disable react-refresh/only-export-components --
 * This file is a widget factory: its primary export is the non-component
 * `createInputTimeNavWidgets`, which composes locally-defined components
 * (`ChevronButton`, `CohortPill`) into overlay widget configs. The components
 * are tightly coupled to the factory and used nowhere else, so splitting
 * them into separate files would be ceremony for a Fast-Refresh-only rule.
 */
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
 * Plans: `media-card-input-time-nav` (time chevrons + cohort pill base),
 * `same-prompt-cohort-nav` (prompt cohort), `set-slot-walk-and-grid`
 * (set chevron walk + Single/Grid pill).
 *
 * Gated by `presetCapabilities.showsInputTimeNav` at the consumer level —
 * gallery / picker cards must not enable this (they don't own a slot id).
 */

import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef } from 'react';


import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';


import { getAssetDisplayUrls, type AssetModel } from '@features/assets';
import { AssetPeekPopover } from '@features/assets/components/AssetPeekPopover';
import {
  useGenerationScopeStores,
  type AssetSetSlotRef,
} from '@features/generation';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';
import type { OperationType } from '@/types/operations';

import { ViewModePill } from './inputSlotViewModePill';
import type { MediaCardOverlayData } from './mediaCardWidgets';
import { useInputSlotNavigation } from './useInputSlotNavigation';

// ─────────────────────────────────────────────────────────────────────────────
// Chevron — render + hover-peek + wheel + click; cohort-agnostic
// (delegates to `useInputSlotNavigation`).
// ─────────────────────────────────────────────────────────────────────────────

interface ChevronButtonProps {
  side: 'left' | 'right';
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
}

function ChevronButton({
  side,
  asset,
  inputId,
  operationType,
  assetSetRef,
}: ChevronButtonProps) {
  const isPrev = side === 'left';
  const isSetMode = Boolean(assetSetRef);

  const { prev, next, isLoadingPrev, isLoadingNext, commit: commitTarget } =
    useInputSlotNavigation({ asset, inputId, operationType, assetSetRef });

  const neighbor = isPrev ? prev : next;
  const isLoading = isPrev ? isLoadingPrev : isLoadingNext;
  const disabled = !neighbor && !isLoading;

  // Resolve the peek thumbnail HERE (not inside AssetPeekPopover) so the
  // blob URL's lifecycle tracks this long-lived ChevronButton rather than
  // the popover's rapid open/close cycles. Without this hoist, an unmount
  // mid-render revokes a blob a still-mounted <img> is trying to load.
  const neighborUrls = neighbor ? getAssetDisplayUrls(neighbor) : null;
  const { thumbSrc: peekThumbSrc, thumbFailed: peekThumbFailed } = useMediaPreviewSource({
    mediaType: neighbor?.mediaType ?? 'image',
    thumbUrl: neighborUrls?.thumbnailUrl,
    previewUrl: neighborUrls?.previewUrl,
    remoteUrl: neighborUrls?.mainUrl,
    mediaActive: false,
  });
  const peekThumb = peekThumbFailed ? undefined : peekThumbSrc;

  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 250,
    collapseDelay: 200,
  });

  const commit = useCallback(() => {
    if (!neighbor) return;
    commitTarget(neighbor);
  }, [neighbor, commitTarget]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      commit();
    },
    [commit],
  );

  // Plain wheel on the chevron commits in the scroll's direction regardless
  // of which chevron you're hovering. Attached via DOM with passive:false so
  // preventDefault beats the browser's native horizontal scroll.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const target = e.deltaY > 0 ? next : prev;
      e.preventDefault();
      e.stopPropagation();
      if (!target) return;
      commitTarget(target);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [prev, next, commitTarget]);

  // Tooltips per cohort so users know what they're walking.
  const titleNoNeighbor = isSetMode
    ? side === 'left'
      ? 'No earlier member in this set'
      : 'No later member in this set'
    : side === 'left'
      ? 'No earlier asset for this operation'
      : 'No later asset for this operation';
  const titleActive = isSetMode
    ? side === 'left'
      ? 'Previous set member  ·  pins on click  ·  [ key'
      : 'Next set member  ·  pins on click  ·  ] key'
    : side === 'left'
      ? 'Previous in time  ·  scroll up / down to walk  ·  [ key'
      : 'Next in time  ·  scroll up / down to walk  ·  ] key';

  return (
    <div {...handlers} className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="
          flex h-9 w-7 items-center justify-center
          rounded-md bg-black/55 text-white/90
          backdrop-blur-sm shadow-md
          hover:bg-black/75 hover:text-white
          disabled:opacity-30 disabled:cursor-default
          transition-colors
        "
        title={isLoading ? 'Loading neighbor…' : disabled ? titleNoNeighbor : titleActive}
        aria-label={side === 'left' ? 'Previous asset' : 'Next asset'}
      >
        <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={16} />
      </button>
      <AssetPeekPopover
        asset={neighbor}
        thumbSrc={peekThumb}
        anchorRef={buttonRef}
        open={isExpanded && !!neighbor && !disabled}
        placement={isPrev ? 'left' : 'right'}
        onCommit={commit}
        onClose={() => { /* hover-out dismisses; nothing to do */ }}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        caption={isPrev ? 'Previous' : 'Next'}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cohort pill — Time ⇄ Prompt (non-set slots)
// ─────────────────────────────────────────────────────────────────────────────

interface CohortPillProps {
  asset: AssetModel;
  operationType: OperationType;
}

function CohortPill({ asset, operationType }: CohortPillProps) {
  const { useInputStore } = useGenerationScopeStores();
  const cohort = useInputStore(
    (s) => s.navCohortByOperation[operationType] ?? 'time',
  );
  const setInputNavCohort = useInputStore((s) => s.setInputNavCohort);

  const promptAvailable = Boolean(asset.promptVersionId);
  const isPrompt = cohort === 'prompt' && promptAvailable;
  const label = isPrompt ? 'Prompt' : 'Time';

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!promptAvailable) return;
      setInputNavCohort(operationType, isPrompt ? 'time' : 'prompt');
    },
    [promptAvailable, isPrompt, setInputNavCohort, operationType],
  );

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      disabled={!promptAvailable}
      className="
        flex items-center gap-1
        h-6 px-2 rounded-full
        bg-black/55 text-white/90 text-[10px] font-medium
        backdrop-blur-sm shadow-md
        hover:bg-black/75 hover:text-white
        disabled:opacity-30 disabled:cursor-default
        transition-colors
      "
      title={
        !promptAvailable
          ? 'Navigating neighbors by time · no prompt version on this asset to group by'
          : isPrompt
            ? 'Navigating by same prompt · click to switch to time'
            : 'Navigating by time · click to switch to same prompt'
      }
      aria-label={`Prev/next cohort: ${label}`}
    >
      <Icon name={isPrompt ? 'messageSquare' : 'clock'} size={12} />
      {label}
    </button>
  );
}

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
