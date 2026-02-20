import { useMemo } from 'react';

import type { GalleryGroupBy, GalleryGroupView } from '@features/panels';

import { GROUP_BY_LABELS } from '../lib/groupBy';

import { GroupFolderTile, GroupListRow } from './GroupCards';
import { sortGroups, GROUP_PAGE_SIZE, type AssetGroup, type GroupSortKey } from './groupHelpers';

export interface ParallelAxisData {
  groups: AssetGroup[];
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  error: string | null;
}

interface ParallelGroupSectionProps {
  axis: GalleryGroupBy;
  axisData: ParallelAxisData;
  axisPage: number;
  groupView: GalleryGroupView;
  groupSort: GroupSortKey;
  cardSize: number;
  onOpenGroup: (key: string) => void;
  onPageChange: (page: number) => void;
}

export function ParallelGroupSection({
  axis,
  axisData,
  axisPage,
  groupView,
  groupSort: sortKey,
  cardSize,
  onOpenGroup,
  onPageChange,
}: ParallelGroupSectionProps) {
  const totalPages = useMemo(() => {
    const limit = Math.max(1, axisData.limit || GROUP_PAGE_SIZE);
    return Math.max(1, Math.ceil(axisData.total / limit));
  }, [axisData.total, axisData.limit]);
  const hasMore = axisData.offset + axisData.groups.length < axisData.total;
  const sortedGroups = useMemo(() => sortGroups(axisData.groups, sortKey), [axisData.groups, sortKey]);
  const showFolders = groupView === 'folders';
  const layoutSettings = { rowGap: 12, columnGap: 12 };

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800/80">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
          By {GROUP_BY_LABELS[axis]}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(axisPage - 1)}
            disabled={axisData.loading || axisPage <= 1}
            className="px-2 py-0.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            &lsaquo;
          </button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 px-1">
            {axisPage}/{totalPages}
          </span>
          <button
            onClick={() => onPageChange(axisPage + 1)}
            disabled={axisData.loading || !hasMore}
            className="px-2 py-0.5 text-[11px] border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            &rsaquo;
          </button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-1">
            {axisData.total} groups
          </span>
        </div>
      </div>
      <div className="p-3">
        {axisData.loading ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
        ) : axisData.error ? (
          <div className="text-sm text-red-500">{axisData.error}</div>
        ) : sortedGroups.length > 0 ? (
          showFolders ? (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
                rowGap: `${layoutSettings.rowGap}px`,
                columnGap: `${layoutSettings.columnGap}px`,
              }}
            >
              {sortedGroups.map((group) => (
                <GroupFolderTile
                  key={group.key}
                  group={group}
                  cardSize={cardSize}
                  onOpen={() => onOpenGroup(group.key)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedGroups.map((group) => (
                <GroupListRow
                  key={group.key}
                  group={group}
                  cardSize={cardSize}
                  onOpen={() => onOpenGroup(group.key)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No groups for this axis.
          </div>
        )}
      </div>
    </div>
  );
}
