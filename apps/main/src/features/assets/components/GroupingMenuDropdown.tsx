import { Dropdown, GroupByPillBar, GroupMenuTrigger, SegmentedControl, ToolbarSelect, type GroupByOption } from '@pixsim7/shared.ui';
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

const GALLERY_GROUP_OPTIONS: GroupByOption<GalleryGroupBy>[] = GROUP_BY_UI_VALUES.map(v => ({
  value: v,
  label: GROUP_BY_LABELS[v],
}));

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
      <GroupMenuTrigger
        ref={groupMenuAnchorRef}
        icon={<Icon name="layers" size={14} className={hasGrouping ? 'text-accent' : ''} />}
        active={hasGrouping}
        count={groupByStack.length}
        onClick={() => setGroupMenuOpen(!groupMenuOpen)}
        title={groupSummary}
      />
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
              <SegmentedControl<GalleryGroupMode>
                label="Mode"
                value={groupMode}
                onChange={handleGroupModeChange}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'multi', label: 'Multi' },
                ]}
              />
              {groupMode === 'multi' && groupByStack.length > 1 && (
                <SegmentedControl<GalleryGroupMultiLayout>
                  label="Layout"
                  value={groupMultiLayout}
                  onChange={onMultiLayoutChange}
                  options={[
                    { value: 'stack', label: 'Stack' },
                    { value: 'parallel', label: 'Parallel' },
                  ]}
                />
              )}
              <GroupByPillBar
                options={GALLERY_GROUP_OPTIONS}
                selected={groupByStack}
                onToggle={toggleGroupBy}
                onClear={() => toggleGroupBy('none')}
              />
            </div>
            <ToolbarSelect<GalleryGroupView>
              label="View"
              value={groupView}
              onChange={handleGroupViewChange}
              disabled={!hasGrouping}
              options={[
                { value: 'inline', label: 'List' },
                { value: 'folders', label: 'Folders' },
                { value: 'panel', label: 'Panel (soon)', disabled: true },
              ]}
            />
            <ToolbarSelect<GroupSortKey>
              label="Sort"
              value={groupSort}
              onChange={setGroupSort}
              disabled={!hasGrouping}
              options={GROUP_SORT_OPTIONS}
            />
          </div>
        </Dropdown>
      )}
    </div>
  );
}
