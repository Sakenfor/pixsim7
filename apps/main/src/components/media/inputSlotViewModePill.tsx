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
}

export function ViewModePill({ inputId }: ViewModePillProps) {
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

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      className="
        flex items-center gap-1
        h-6 px-2 rounded-full
        bg-black/55 text-white/90 text-[10px] font-medium
        backdrop-blur-sm shadow-md
        hover:bg-black/75 hover:text-white
        transition-colors
      "
      title={
        isGrid
          ? 'Showing set as grid · click to switch to single card'
          : 'Showing single card · click to show set as grid'
      }
      aria-label={`Set view: ${label}`}
    >
      <Icon name={isGrid ? 'layoutGrid' : 'image'} size={12} />
      {label}
    </button>
  );
}
