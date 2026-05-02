import { Icon } from '@lib/icons';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import type { AssetFilters } from '../hooks/useAssets';
import { useSearchHistory } from '../stores/searchHistoryStore';

export interface SearchHistoryListProps {
  /** Filter key under which queries are bucketed (e.g. 'q', 'sha256'). */
  filterKey: string;
  /** Current live query — used to hide a head entry that just equals it. */
  currentValue?: string;
  /** Click a row → restore the past query into the input. */
  onPick: (query: string) => void;
  /**
   * Translate a past query into an `AssetFilters` slice for the
   * mini-gallery shortcut. Return `undefined` to suppress the icon.
   */
  toFilters: (query: string) => AssetFilters | undefined;
}

export function SearchHistoryList({
  filterKey,
  currentValue,
  onPick,
  toFilters,
}: SearchHistoryListProps) {
  const { entries, remove, clear } = useSearchHistory(filterKey);

  const trimmedCurrent = (currentValue ?? '').trim();
  const visible = trimmedCurrent
    ? entries.filter((q) => q !== trimmedCurrent)
    : entries;

  if (visible.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-1.5 mt-1">
      <div className="group/recents flex items-center gap-1 px-1 pb-1">
        <Icon name="history" size={11} className="w-2.5 h-2.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
        <span className="flex-1 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold">
          Recent
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            clear();
          }}
          title="Clear search history for this filter"
          className="text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 opacity-0 group-hover/recents:opacity-100 transition-opacity"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-col">
        {visible.map((query) => {
          const assetFilters = toFilters(query);
          const hasFilters =
            assetFilters !== undefined && Object.keys(assetFilters).length > 0;
          return (
            <div
              key={query}
              className="group/row flex items-center gap-1 px-1 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onPick(query);
                }}
                title={`Restore "${query}"`}
                className="flex-1 min-w-0 text-left text-xs text-neutral-700 dark:text-neutral-200 truncate py-0.5"
              >
                {query}
              </button>
              {hasFilters && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                      context: {
                        initialFilters: assetFilters,
                        sourceLabel: `"${query}"`,
                        suppressHoverActions: true,
                      },
                      x: rect.right + 8,
                      y: rect.top,
                    });
                  }}
                  title={`Open "${query}" in Mini Gallery`}
                  aria-label={`Open "${query}" in Mini Gallery`}
                  className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/row:opacity-100 transition-[opacity,transform,background-color] duration-150"
                >
                  <Icon name="externalLink" size={11} className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  remove(query);
                }}
                title="Remove from history"
                aria-label={`Remove "${query}" from history`}
                className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200 opacity-0 group-hover/row:opacity-100 transition-opacity"
              >
                <Icon name="x" size={11} className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
