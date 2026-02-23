import { Dropdown } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { LOCAL_GROUP_BY_OPTIONS, type LocalGroupBy } from '../../lib/localGroupEngine';
import { GROUP_SORT_OPTIONS, type GroupSortKey } from '../groupHelpers';


export interface LocalGroupingMenuProps {
  groupBy: LocalGroupBy | 'none';
  groupView: 'folders' | 'inline';
  groupSort: GroupSortKey;
  setGroupBy: (value: LocalGroupBy | 'none') => void;
  setGroupView: (value: 'folders' | 'inline') => void;
  setGroupSort: (value: GroupSortKey) => void;
}

export function LocalGroupingMenu({
  groupBy,
  groupView,
  groupSort,
  setGroupBy,
  setGroupView,
  setGroupSort,
}: LocalGroupingMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const hasGrouping = groupBy !== 'none';
  const activeLabel = LOCAL_GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? 'None';
  const summary = `Grouping: ${activeLabel}`;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={summary}
        aria-label={summary}
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
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom-left"
        triggerRef={btnRef}
        minWidth="240px"
        className="z-50"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Grouping
            </span>
            {hasGrouping && (
              <button
                type="button"
                onClick={() => setGroupBy('none')}
                className="text-[11px] text-accent hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Group-by pills */}
          <div className="flex flex-wrap gap-2">
            {LOCAL_GROUP_BY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupBy(opt.value)}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  groupBy === opt.value
                    ? 'bg-accent border-accent text-accent-text'
                    : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:border-accent-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* View selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              View
            </span>
            <select
              className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent"
              value={groupView}
              onChange={(e) => setGroupView(e.target.value as 'folders' | 'inline')}
              disabled={!hasGrouping}
            >
              <option value="folders">Folders</option>
              <option value="inline">List</option>
            </select>
          </div>

          {/* Sort selector */}
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
    </div>
  );
}
