import { Dropdown } from '@pixsim7/shared.ui';
import type { RefObject } from 'react';

import { Icon } from '@lib/icons';

import type {
  GalleryGroupBy,
  GalleryGroupMode,
  GalleryGroupMultiLayout,
  GalleryGroupView,
} from '@features/panels';

import { GROUP_BY_LABELS, GROUP_BY_UI_VALUES } from '../lib/groupBy';

import { GROUP_SORT_OPTIONS, type GroupSortKey } from './groupHelpers';

export interface GroupingMenuDropdownProps {
  groupMenuAnchorRef: RefObject<HTMLButtonElement | null>;
  groupMenuOpen: boolean;
  setGroupMenuOpen: (open: boolean) => void;
  groupMenuRect: DOMRect | null;
  groupByStack: GalleryGroupBy[];
  groupMode: GalleryGroupMode;
  groupMultiLayout: GalleryGroupMultiLayout;
  groupView: GalleryGroupView;
  groupSort: GroupSortKey;
  toggleGroupBy: (value: GalleryGroupBy | 'none') => void;
  handleGroupModeChange: (mode: GalleryGroupMode) => void;
  handleGroupViewChange: (view: GalleryGroupView) => void;
  setGroupSort: (sort: GroupSortKey) => void;
  onMultiLayoutChange: (layout: GalleryGroupMultiLayout) => void;
}

export function GroupingMenuDropdown({
  groupMenuAnchorRef,
  groupMenuOpen,
  setGroupMenuOpen,
  groupMenuRect,
  groupByStack,
  groupMode,
  groupMultiLayout,
  groupView,
  groupSort,
  toggleGroupBy,
  handleGroupModeChange,
  handleGroupViewChange,
  setGroupSort,
  onMultiLayoutChange,
}: GroupingMenuDropdownProps) {
  const hasGrouping = groupByStack.length > 0;
  const groupSummary = hasGrouping
    ? `Grouping: ${groupByStack.map((v) => GROUP_BY_LABELS[v]).join(' > ')}`
    : 'Grouping: None';

  return (
    <div className="flex items-center gap-2">
      <button
        ref={groupMenuAnchorRef}
        type="button"
        onClick={() => setGroupMenuOpen(!groupMenuOpen)}
        title={groupSummary}
        aria-label={groupSummary}
        className={`relative inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          hasGrouping
            ? 'bg-accent/10 border-accent/50 text-accent'
            : 'bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <Icon
          name="layers"
          size={14}
          className={hasGrouping ? 'text-accent' : ''}
        />
        {groupByStack.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
            {groupByStack.length}
          </span>
        )}
      </button>
      {groupMenuOpen && groupMenuRect && (
        <Dropdown
          isOpen={groupMenuOpen}
          onClose={() => setGroupMenuOpen(false)}
          positionMode="fixed"
          anchorPosition={{
            x: Math.max(
              8,
              Math.min(
                groupMenuRect.left,
                window.innerWidth - 320 - 8
              )
            ),
            y: groupMenuRect.bottom + 8,
          }}
          minWidth="280px"
          className="max-w-[360px]"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Grouping
              </span>
              <button
                type="button"
                onClick={() => toggleGroupBy('none')}
                className="text-[11px] text-accent hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Mode
                </span>
                <div className="flex items-center gap-1">
                  {(['single', 'multi'] as GalleryGroupMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleGroupModeChange(mode)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        groupMode === mode
                          ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900'
                          : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
                      }`}
                    >
                      {mode === 'single' ? 'Single' : 'Multi'}
                    </button>
                  ))}
                </div>
              </div>
              {groupMode === 'multi' && groupByStack.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Layout
                  </span>
                  <div className="flex items-center gap-1">
                    {(['stack', 'parallel'] as GalleryGroupMultiLayout[]).map((layoutOpt) => (
                      <button
                        key={layoutOpt}
                        type="button"
                        onClick={() => onMultiLayoutChange(layoutOpt)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          groupMultiLayout === layoutOpt
                            ? 'bg-neutral-900 border-neutral-900 text-white dark:bg-neutral-100 dark:border-neutral-100 dark:text-neutral-900'
                            : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-accent-muted'
                        }`}
                      >
                        {layoutOpt === 'stack' ? 'Stack' : 'Parallel'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleGroupBy('none')}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    groupByStack.length === 0
                      ? 'bg-accent border-accent text-accent-text'
                      : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
                  }`}
                >
                  None
                </button>
                {GROUP_BY_UI_VALUES.map((value) => {
                  const index = groupByStack.indexOf(value);
                  const selected = index >= 0;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleGroupBy(value)}
                      className={`px-2 py-1 text-xs rounded border transition-colors inline-flex items-center gap-1 ${
                        selected
                          ? 'bg-accent border-accent text-accent-text'
                          : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
                      }`}
                    >
                      <span>{GROUP_BY_LABELS[value]}</span>
                      {groupMode === 'multi' && selected && (
                        <span className="text-[10px] px-1 rounded-full bg-white/20">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                View
              </span>
              <select
                className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
                value={groupView}
                onChange={(e) => handleGroupViewChange(e.target.value as GalleryGroupView)}
                disabled={!hasGrouping}
              >
                <option value="inline">List</option>
                <option value="folders">Folders</option>
                <option value="panel" disabled>
                  Panel (soon)
                </option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Sort
              </span>
              <select
                className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
                value={groupSort}
                onChange={(e) => setGroupSort(e.target.value as GroupSortKey)}
                disabled={!hasGrouping}
              >
                {GROUP_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Dropdown>
      )}
    </div>
  );
}
