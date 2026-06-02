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
import { useHasLocalFolderOrigin } from '@features/assets/hooks/useLocalFolderSiblings';
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
      disabled:cursor-default
      transition-colors
    `
    : `
      flex h-9 w-7 items-center justify-center
      rounded-md bg-black/55 text-white/90
      backdrop-blur-sm shadow-md
      hover:bg-black/75 hover:text-white
      disabled:cursor-default
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
  /**
   * When set, flank the cohort icon with green up/down chevrons. Both
   * chevrons are clickable (tap = prev/next) when `onPrev`/`onNext` are
   * provided. `dir` + `tick` drive a one-shot `animate-bounce-once` flash
   * on the chevron matching the last commit direction; bumping `tick`
   * re-triggers the animation each commit.
   */
  scrollHint?: {
    dir: 'prev' | 'next' | null;
    tick: number;
    onPrev?: () => void;
    onNext?: () => void;
  };
}

export function CohortPill({ asset, operationType, bare = false, scrollHint }: CohortPillProps) {
  const { useInputStore } = useGenerationScopeStores();
  // Normalize legacy persisted `'prompt'` (old cohort name) → `'source'`.
  const cohort = useInputStore((s) => {
    const raw = s.navCohortByOperation[operationType];
    if ((raw as string) === 'prompt') return 'source';
    return raw ?? 'time';
  });
  const setInputNavCohort = useInputStore((s) => s.setInputNavCohort);

  // The Source cohort adapts to the asset's actual source: a folder for
  // assets we can trace to a local folder (either LocalAssetModel directly
  // or a backend asset whose `last_upload_asset_id` is tracked), or the
  // prompt-version cohort for generated assets. Disabled when the asset
  // has neither signal (e.g. plain uploads).
  const hasLocalOrigin = useHasLocalFolderOrigin(asset);
  const hasPromptSource = Boolean(asset.promptVersionId);
  const sourceAvailable = hasLocalOrigin || hasPromptSource;
  const isSource = cohort === 'source' && sourceAvailable;
  const label = isSource ? 'Source' : 'Time';
  const sourceKind: 'folder' | 'prompt' | null = hasLocalOrigin
    ? 'folder'
    : hasPromptSource
      ? 'prompt'
      : null;
  const cohortIconName = isSource
    ? sourceKind === 'folder'
      ? 'folder'
      : 'messageSquare'
    : 'clock';

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!sourceAvailable) return;
      setInputNavCohort(operationType, isSource ? 'time' : 'source');
    },
    [sourceAvailable, isSource, setInputNavCohort, operationType],
  );

  const className = bare
    ? `
      flex items-center gap-1
      text-white/90 text-[10px] font-medium
      hover:text-white
      disabled:cursor-default
      transition-colors
    `
    : `
      flex items-center gap-1
      h-6 px-2 rounded-full
      bg-black/55 text-white/90 text-[10px] font-medium
      backdrop-blur-sm shadow-md
      hover:bg-black/75 hover:text-white
      disabled:cursor-default
      transition-colors
    `;

  const sourceDescription = sourceKind === 'folder' ? 'same folder' : 'same prompt';
  const toggleTitle = !sourceAvailable
    ? 'Navigating neighbors by time · no source signal on this asset (no folder or prompt version)'
    : isSource
      ? `Navigating by ${sourceDescription} · click to switch to time`
      : `Navigating by time · click to switch to ${sourceDescription}`;

  // scrollHint mode: render a div container (not a single button) so the
  // up/down chevrons can be their own clickable prev/next buttons alongside
  // the label's toggle button. The cohort icon stays a visual indicator.
  // Walking remains available even when the toggle is disabled (no prompt
  // version), so the green chevrons keep full color in that case.
  if (scrollHint) {
    const handlePrev = (e: React.MouseEvent) => {
      e.stopPropagation();
      scrollHint.onPrev?.();
    };
    const handleNext = (e: React.MouseEvent) => {
      e.stopPropagation();
      scrollHint.onNext?.();
    };
    return (
      <div className={className} role="group" aria-label={`Cohort: ${label}`}>
        <span className="flex flex-col items-center leading-none">
          <button
            key={scrollHint.dir === 'prev' ? `up-${scrollHint.tick}` : 'up'}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePrev}
            disabled={!scrollHint.onPrev}
            className={`-my-0.5 flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-default transition-colors ${scrollHint.dir === 'prev' ? 'animate-bounce-once' : ''}`}
            title="Previous neighbor"
            aria-label="Previous neighbor"
          >
            <Icon name="chevronUp" size={10} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            disabled={!sourceAvailable}
            className={`flex items-center justify-center transition-colors ${!sourceAvailable ? 'opacity-30 cursor-default' : 'cursor-pointer hover:text-white'}`}
            title={toggleTitle}
            aria-label={`Toggle cohort: ${label}`}
          >
            <Icon name={cohortIconName} size={12} />
          </button>
          <button
            key={scrollHint.dir === 'next' ? `down-${scrollHint.tick}` : 'down'}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleNext}
            disabled={!scrollHint.onNext}
            className={`-my-0.5 flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-default transition-colors ${scrollHint.dir === 'next' ? 'animate-bounce-once' : ''}`}
            title="Next neighbor"
            aria-label="Next neighbor"
          >
            <Icon name="chevronDown" size={10} />
          </button>
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          disabled={!sourceAvailable}
          className={
            `gen-scrub-label ${!sourceAvailable ? 'opacity-30 cursor-default' : 'cursor-pointer'}`.trim()
          }
          title={toggleTitle}
          aria-label={`Toggle cohort: ${label}`}
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      disabled={!sourceAvailable}
      className={className}
      title={toggleTitle}
      aria-label={`Prev/next cohort: ${label}`}
    >
      <Icon name={cohortIconName} size={12} />
      {label}
    </button>
  );
}
