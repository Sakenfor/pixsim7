/**
 * Input-slot navigation controls — `ChevronButton` + `CohortPill`.
 *
 * Extracted from `inputTimeNavWidget.tsx` so they can be reused both by the
 * desktop overlay-widget factory (edge chevrons + top cohort pill) and by the
 * mobile `CarouselMobileNavBar` (one consolidated bottom bar). Both render the
 * same affordances and route through `useInputSlotNavigation`, so every
 * surface walks the same neighbor lookup.
 *
 * `ChevronButton` takes a `compact` flag: the desktop edge variant is a tall
 * translucent pill (`h-9 w-7`); the compact variant is a small transparent
 * icon button meant to sit inside a parent bar that already supplies the
 * background.
 *
 * Plans: `media-card-input-time-nav`, `same-prompt-cohort-nav`,
 * `set-slot-walk-and-grid`.
 */

import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef } from 'react';

import { Icon } from '@lib/icons';

import { getAssetDisplayUrls, type AssetModel } from '@features/assets';
import { AssetPeekPopover } from '@features/assets/components/AssetPeekPopover';
import {
  useGenerationScopeStores,
  type AssetSetSlotRef,
} from '@features/generation';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';
import type { OperationType } from '@/types/operations';

import { useInputSlotNavigation } from './useInputSlotNavigation';

// ─────────────────────────────────────────────────────────────────────────────
// Chevron — render + hover-peek + wheel + click; cohort-agnostic
// (delegates to `useInputSlotNavigation`).
// ─────────────────────────────────────────────────────────────────────────────

export interface ChevronButtonProps {
  side: 'left' | 'right';
  asset: AssetModel;
  inputId: string;
  operationType: OperationType;
  assetSetRef: AssetSetSlotRef | undefined;
  /** Compact, transparent variant for embedding inside a parent bar. */
  compact?: boolean;
}

export function ChevronButton({
  side,
  asset,
  inputId,
  operationType,
  assetSetRef,
  compact = false,
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

  const buttonClass = compact
    ? `
      flex h-6 w-6 items-center justify-center
      rounded text-white/90
      hover:text-white
      disabled:opacity-30 disabled:cursor-default
      transition-colors
    `
    : `
      flex h-9 w-7 items-center justify-center
      rounded-md bg-black/55 text-white/90
      backdrop-blur-sm shadow-md
      hover:bg-black/75 hover:text-white
      disabled:opacity-30 disabled:cursor-default
      transition-colors
    `;

  return (
    <div {...handlers} className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={buttonClass}
        title={isLoading ? 'Loading neighbor…' : disabled ? titleNoNeighbor : titleActive}
        aria-label={side === 'left' ? 'Previous asset' : 'Next asset'}
      >
        <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={compact ? 14 : 16} />
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

export interface CohortPillProps {
  asset: AssetModel;
  operationType: OperationType;
  /** Drop the pill background/padding so it can sit inside a parent bar. */
  bare?: boolean;
}

export function CohortPill({ asset, operationType, bare = false }: CohortPillProps) {
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

  const className = bare
    ? `
      flex items-center gap-1
      text-white/90 text-[10px] font-medium
      hover:text-white
      disabled:opacity-30 disabled:cursor-default
      transition-colors
    `
    : `
      flex items-center gap-1
      h-6 px-2 rounded-full
      bg-black/55 text-white/90 text-[10px] font-medium
      backdrop-blur-sm shadow-md
      hover:bg-black/75 hover:text-white
      disabled:opacity-30 disabled:cursor-default
      transition-colors
    `;

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      disabled={!promptAvailable}
      className={className}
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
