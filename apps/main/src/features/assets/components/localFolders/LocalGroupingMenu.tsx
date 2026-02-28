import { Dropdown, GroupMenuTrigger, ToolbarSelect } from '@pixsim7/shared.ui';
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
      <GroupMenuTrigger
        ref={btnRef}
        icon={<Icon name="layers" size={14} className={hasGrouping ? 'text-accent' : ''} />}
        active={hasGrouping}
        onClick={() => setOpen((v) => !v)}
        title={summary}
      />
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
          <ToolbarSelect<'folders' | 'inline'>
            label="View"
            value={groupView}
            onChange={setGroupView}
            disabled={!hasGrouping}
            options={[
              { value: 'folders', label: 'Folders' },
              { value: 'inline', label: 'List' },
            ]}
          />

          {/* Sort selector */}
          <ToolbarSelect<GroupSortKey>
            label="Sort"
            value={groupSort}
            onChange={setGroupSort}
            disabled={!hasGrouping}
            options={GROUP_SORT_OPTIONS}
          />
        </div>
      </Dropdown>
    </div>
  );
}
