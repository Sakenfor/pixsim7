import { GroupByPillBar, GroupMenuTrigger, Popover, SegmentedControl, ToolbarSelect, type GroupByOption } from '@pixsim7/shared.ui';
import type { RefObject } from 'react';

import { Icon } from '@lib/icons';

import type {
  GalleryClusterBy,
  GalleryGroupBy,
  GalleryGroupMode,
  GalleryGroupMultiLayout,
  GalleryGroupView,
} from '@features/panels';

import { CLUSTER_BY_OPTIONS, type ClusterByDimension } from '../lib/clusterHelpers';
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
  groupByStack: GalleryGroupBy[];
  groupMode: GalleryGroupMode;
  groupMultiLayout: GalleryGroupMultiLayout;
  groupView: GalleryGroupView;
  groupSort: GroupSortKey;
  clusterBy: GalleryClusterBy;
  toggleGroupBy: (value: GalleryGroupBy | 'none') => void;
  handleGroupModeChange: (mode: GalleryGroupMode) => void;
  handleGroupViewChange: (view: GalleryGroupView) => void;
  setGroupSort: (sort: GroupSortKey) => void;
  onMultiLayoutChange: (layout: GalleryGroupMultiLayout) => void;
  onClusterByChange: (dimension: GalleryClusterBy) => void;
}

export function GroupingMenuDropdown({
  groupMenuAnchorRef,
  groupMenuOpen,
  setGroupMenuOpen,
  groupByStack,
  groupMode,
  groupMultiLayout,
  groupView,
  groupSort,
  clusterBy,
  toggleGroupBy,
  handleGroupModeChange,
  handleGroupViewChange,
  setGroupSort,
  onMultiLayoutChange,
  onClusterByChange,
}: GroupingMenuDropdownProps) {
  const hasGrouping = groupByStack.length > 0;
  const isClusterActive = groupView === 'cluster';
  const isActive = hasGrouping || isClusterActive;
  const groupSummary = isClusterActive
    ? `Cluster by ${clusterBy}`
    : hasGrouping
      ? `Grouping: ${groupByStack.map((v) => GROUP_BY_LABELS[v]).join(' > ')}`
      : 'Grouping: None';

  return (
    <div className="flex items-center gap-2">
      <GroupMenuTrigger
        ref={groupMenuAnchorRef}
        icon={<Icon name="layers" size={14} className={isActive ? 'text-accent' : ''} />}
        active={isActive}
        count={isClusterActive ? 0 : groupByStack.length}
        onClick={() => setGroupMenuOpen(!groupMenuOpen)}
        title={groupSummary}
      />
      <Popover
        open={groupMenuOpen}
        onClose={() => setGroupMenuOpen(false)}
        anchor={groupMenuAnchorRef.current}
        placement="bottom"
        align="start"
        offset={8}
        triggerRef={groupMenuAnchorRef}
        className="w-[320px] max-w-[360px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-3"
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
              disabled={!hasGrouping && groupView !== 'cluster'}
              options={[
                { value: 'inline', label: 'List' },
                { value: 'folders', label: 'Folders' },
                { value: 'cluster', label: 'Cluster' },
                { value: 'panel', label: 'Panel (soon)', disabled: true },
              ]}
            />
            {groupView === 'cluster' && (
              <ToolbarSelect<ClusterByDimension>
                label="Cluster by"
                value={clusterBy}
                onChange={(v) => onClusterByChange(v as GalleryClusterBy)}
                options={CLUSTER_BY_OPTIONS}
              />
            )}
            <ToolbarSelect<GroupSortKey>
              label="Sort"
              value={groupSort}
              onChange={setGroupSort}
              disabled={!hasGrouping && groupView !== 'cluster'}
              options={GROUP_SORT_OPTIONS}
            />
          </div>
      </Popover>
    </div>
  );
}
