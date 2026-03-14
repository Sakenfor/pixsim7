/**
 * PromptAuthoringAssets
 *
 * Right sub-panel: scoped asset gallery.
 * Shows generated assets filtered by version/branch/family scope.
 */

import clsx from 'clsx';

import { Icon } from '@lib/icons';

import {
  usePromptAuthoring,
  formatDate,
  type AssetScopeMode,
} from '../../context/PromptAuthoringContext';

const SCOPE_OPTIONS: Array<[AssetScopeMode, string]> = [
  ['version', 'This version'],
  ['branch', 'This branch'],
  ['family', 'Whole family'],
];

export function PromptAuthoringAssets() {
  const {
    scopeMode,
    setScopeMode,
    scopeAssets,
    assetsLoading,
    assetsError,
    targetVersionIds,
    truncatedVersionCount,
    refreshScopeAssets,
  } = usePromptAuthoring();

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-neutral-900/60">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Generated Assets</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Branch-aware scope filters for prompt outputs.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshScopeAssets()}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
          >
            <Icon name="refresh" size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1 mt-2">
          {SCOPE_OPTIONS.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScopeMode(mode)}
              className={clsx(
                'text-[11px] px-2 py-1 rounded border',
                scopeMode === mode
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          Scope versions: {targetVersionIds.length}
          {truncatedVersionCount > 0 ? ` (showing latest 16)` : ''}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {assetsError && (
          <div className="text-[11px] text-red-600 dark:text-red-300 mb-2">{assetsError}</div>
        )}
        {assetsLoading && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Loading assets...</div>
        )}
        {!assetsLoading && scopeAssets.length === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            No assets found for the current scope.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {scopeAssets.map((asset) => {
            const src = asset.thumbnail_url || asset.remote_url || null;
            return (
              <div
                key={`${asset.id}:${asset.version_id}`}
                className="rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-100 dark:bg-neutral-800"
                title={`Asset ${asset.id} | version ${asset.version_id}`}
              >
                <div className="aspect-square bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                  {src ? (
                    <img
                      src={src}
                      alt={`Asset ${asset.id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      no preview
                    </span>
                  )}
                </div>
                <div className="px-2 py-1 text-[10px] text-neutral-600 dark:text-neutral-300 space-y-0.5">
                  <div className="font-medium text-neutral-700 dark:text-neutral-200">
                    #{asset.id} | {asset.media_type}
                  </div>
                  <div className="truncate">v:{asset.version_id.slice(0, 8)}</div>
                  <div>{formatDate(asset.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
