/**
 * ViewModePill — Single / Grid toggle for an asset-set-linked input slot.
 *
 * Lives in its own file (not inside `inputTimeNavWidget.tsx`) for two reasons:
 *  1. `inputTimeNavWidget` primarily exports a non-component widget factory
 *     (`createInputTimeNavWidgets`); mixing exported components in the same
 *     file trips `react-refresh/only-export-components`.
 *  2. `SetGridOverlay` is an external consumer — when grid mode replaces
 *     MediaCard entirely, the overlay-widget pill isn't reachable, so the
 *     grid renders its own copy of this pill to toggle back.
 *
 * Plan: `set-slot-walk-and-grid`.
 */

import { useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useSetSlotViewStore } from '@features/generation/stores/setSlotViewStore';

export interface ViewModePillProps {
  inputId: string;
  /** Drop the pill background/padding so it can sit inside a parent bar. */
  bare?: boolean;
  /**
   * When set, flank the view icon with green up/down chevrons to signal the
   * badge accepts scroll/swipe walk (sister to CohortPill's scrollHint).
   */
  scrollHint?: {
    dir: 'prev' | 'next' | null;
    tick: number;
    onPrev?: () => void;
    onNext?: () => void;
  };
}

export function ViewModePill({ inputId, bare = false, scrollHint }: ViewModePillProps) {
  const viewMode = useSetSlotViewStore(
    (s) => s.viewByInputId[inputId] ?? 'single',
  );
  const setView = useSetSlotViewStore((s) => s.setView);
  const isGrid = viewMode === 'grid';
  const label = isGrid ? 'Grid' : 'Single';

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setView(inputId, isGrid ? 'single' : 'grid');
    },
    [inputId, isGrid, setView],
  );

  const className = bare
    ? `
      flex items-center gap-1
      text-white/90 text-[10px] font-medium
      hover:text-white
      transition-colors
    `
    : `
      flex items-center gap-1
      h-6 px-2 rounded-full
      bg-black/55 text-white/90 text-[10px] font-medium
      backdrop-blur-sm shadow-md
      hover:bg-black/75 hover:text-white
      transition-colors
    `;

  const toggleTitle = isGrid
    ? 'Showing set as grid · click to switch to single card'
    : 'Showing single card · click to show set as grid';

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
      <div className={className} role="group" aria-label={`Set view: ${label}`}>
        <span className="flex flex-col items-center leading-none">
          <button
            key={scrollHint.dir === 'prev' ? `up-${scrollHint.tick}` : 'up'}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePrev}
            disabled={!scrollHint.onPrev}
            className={`-my-0.5 flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-default transition-colors ${scrollHint.dir === 'prev' ? 'animate-bounce-once' : ''}`}
            title="Previous member"
            aria-label="Previous member"
          >
            <Icon name="chevronUp" size={10} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            className="flex items-center justify-center cursor-pointer hover:text-white transition-colors"
            title={toggleTitle}
            aria-label={`Toggle view: ${label}`}
          >
            <Icon name={isGrid ? 'layoutGrid' : 'image'} size={12} />
          </button>
          <button
            key={scrollHint.dir === 'next' ? `down-${scrollHint.tick}` : 'down'}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleNext}
            disabled={!scrollHint.onNext}
            className={`-my-0.5 flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-default transition-colors ${scrollHint.dir === 'next' ? 'animate-bounce-once' : ''}`}
            title="Next member"
            aria-label="Next member"
          >
            <Icon name="chevronDown" size={10} />
          </button>
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
          className="gen-scrub-label cursor-pointer"
          title={toggleTitle}
          aria-label={`Toggle view: ${label}`}
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
      className={className}
      title={toggleTitle}
      aria-label={`Set view: ${label}`}
    >
      <Icon name={isGrid ? 'layoutGrid' : 'image'} size={12} />
      {label}
    </button>
  );
}
