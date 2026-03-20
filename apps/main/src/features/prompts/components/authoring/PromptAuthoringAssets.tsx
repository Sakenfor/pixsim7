/**
 * PromptAuthoringAssets
 *
 * Right sub-panel: scoped asset gallery.
 * Uses the standard gallery pipeline (useAssets) with prompt_version_id filter.
 */

import clsx from 'clsx';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

import { useAssets, type AssetFilters } from '@features/assets/hooks/useAssets';

import { MediaCard } from '@/components/media/MediaCard';

import {
  usePromptAuthoring,
  type AssetScopeMode,
} from '../../context/PromptAuthoringContext';

const SCOPE_OPTIONS: Array<[AssetScopeMode, string]> = [
  ['version', 'This version'],
  ['branch', 'This branch'],
  ['family', 'All versions'],
];

export function PromptAuthoringAssets() {
  const {
    scopeMode,
    setScopeMode,
    targetVersionIds,
    truncatedVersionCount,
  } = usePromptAuthoring();

  // Use the first scoped version ID for the filter.
  // For multi-version scopes (branch/family), we use asset_ids from all versions
  // but the simplest approach is filtering by the target version IDs.
  const hasScope = targetVersionIds.length > 0;
  const filters = useMemo<AssetFilters>(() => {
    if (!hasScope) return { asset_ids: [], sort: 'new' }; // empty result set
    return { prompt_version_id: targetVersionIds[0], sort: 'new' };
  }, [targetVersionIds, hasScope]);

  const { items, loading, error, refresh } = useAssets({
    limit: 50,
    filters,
  });

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      <div className="px-2.5 pt-2.5 pb-2 space-y-1.5 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Assets</div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1 rounded text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Refresh"
          >
            <Icon name="refresh" size={11} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {SCOPE_OPTIONS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScopeMode(mode)}
              className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded border',
                scopeMode === mode
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300',
              )}
            >
              {label}
            </button>
          ))}
          {truncatedVersionCount > 0 && (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 ml-auto">
              latest 16
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {error && (
          <div className="text-[11px] text-red-600 dark:text-red-300 mb-2">{error}</div>
        )}
        {loading && items.length === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center py-6">
            Loading...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center py-6">
            No assets yet.
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              size="sm"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
