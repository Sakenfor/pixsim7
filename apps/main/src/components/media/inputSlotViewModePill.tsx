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

import { WalkTogglePill } from './walkNavControls';

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

  // scrollHint mode delegates to the shared WalkTogglePill (sister to
  // CohortPill): prev/next chevrons flanking a non-interactive view icon + the
  // label toggle. Touch gets the vertical layout + hold-to-toggle; desktop the
  // compact horizontal pill.
  if (scrollHint) {
    return (
      <WalkTogglePill
        bare={bare}
        icon={isGrid ? 'layoutGrid' : 'image'}
        label={label}
        toggleTitle={toggleTitle}
        onToggle={() => setView(inputId, isGrid ? 'single' : 'grid')}
        groupAriaLabel={`Set view: ${label}`}
        toggleAriaLabel={`Toggle view: ${label}`}
        scrollHint={scrollHint}
        prevLabel="Previous member"
        nextLabel="Next member"
      />
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
