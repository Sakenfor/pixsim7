/**
 * LocalIngestionToolbar — contextual ingestion/source-management chrome for the
 * local-folders scope.
 *
 * Consolidates the ingestion-only controls that must stay scoped to local
 * folders (and out of the generic gallery view): Add Folder, scan progress,
 * bulk-hash progress (pause/resume/cancel), the browser-unsupported / error
 * banners, and missing-folder reconnect (permission re-grant). Extracted from
 * LocalFoldersPanel; behavior-preserving. See plan
 * `local-folders-as-gallery-source` / `triage-toolbar`.
 */

import { useMemo } from 'react';

import { CompositeIcon, Icons } from '@lib/icons';

import type { LocalFoldersController } from '@/types/localSources';

import { formatBytes } from './utils';

export interface LocalIngestionToolbarProps {
  controller: LocalFoldersController;
}

export function LocalIngestionToolbar({ controller }: LocalIngestionToolbarProps) {
  const hashingBytesLabel = useMemo(() => {
    const progress = controller.hashingProgress;
    if (!progress?.bytesTotal || progress.bytesTotal <= 0) return null;

    const bytesDone = Math.max(0, progress.bytesDone ?? 0);
    const bytesTotal = Math.max(1, progress.bytesTotal);
    const percent = Math.min(100, Math.round((bytesDone / bytesTotal) * 100));
    return `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)} (${percent}%)`;
  }, [controller.hashingProgress]);

  const hashingPhaseLabel = useMemo(() => {
    const phase = controller.hashingProgress?.phase;
    if (phase === 'digesting') return 'digesting';
    return 'reading';
  }, [controller.hashingProgress?.phase]);

  // The "Local Folders" header + "Add Folder" button moved into the gallery
  // toolbar row (see LocalFoldersContent's leadingToolbarSlot). This component
  // now only renders the transient ingestion banners; when none are active it
  // collapses entirely so it claims no vertical space.
  const hasBanner = controller.scanning !== null
    || controller.hashingProgress !== null
    || !controller.supported
    || !!controller.error
    || controller.missingFolderNames.length > 0;

  if (!hasBanner) return null;

  return (
    <div className="flex-shrink-0 mb-3 px-6 space-y-2">
      {/* Scanning progress */}
      {controller.scanning && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="font-medium">Scanning folder...</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400">
              {controller.scanning.scanned.toLocaleString()} scanned, {controller.scanning.found.toLocaleString()} media found
            </span>
          </div>
        </div>
      )}

      {/* Hashing progress */}
      {controller.hashingProgress && (
        <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
          {!controller.hashingPaused && (
            <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
          <span className="flex-1 min-w-0">
            <span className="block truncate">
              {controller.hashingPaused
                ? 'Paused'
                : `Hashing ${controller.hashingProgress.done}/${controller.hashingProgress.total} (${hashingPhaseLabel})`}
            </span>
            {hashingBytesLabel && (
              <span className="block truncate opacity-80">
                {hashingBytesLabel}
                {controller.hashingProgress.activeAssetName
                  ? ` - ${controller.hashingProgress.activeAssetName}`
                  : ''}
              </span>
            )}
          </span>
          <button
            onClick={controller.hashingPaused ? controller.resumeHashing : controller.pauseHashing}
            className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            title={controller.hashingPaused ? 'Resume' : 'Pause'}
          >
            {controller.hashingPaused ? <Icons.play size={12} /> : <Icons.pause size={12} />}
          </button>
          <button
            onClick={controller.cancelHashing}
            className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            title="Cancel"
          >
            <Icons.x size={12} />
          </button>
        </div>
      )}

      {/* Browser unsupported / error banners */}
      {!controller.supported && (
        <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
          <Icons.alertTriangle size={16} />
          <span>Your browser does not support local folder access. Use Chrome/Edge.</span>
        </div>
      )}
      {controller.error && (
        <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400">
          {controller.error}
        </div>
      )}

      {/* Missing folders warning (permission re-grant / reconnect) */}
      {controller.missingFolderNames.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
            <Icons.alertTriangle size={14} />
            <span className="font-medium">Some folders need to be re-added</span>
            <button
              className="ml-auto text-[10px] text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 underline"
              onClick={controller.dismissMissingFolders}
            >
              Dismiss
            </button>
          </div>
          <p className="text-amber-600 dark:text-amber-400 text-[10px] mb-1.5">
            Browser storage was cleared. Click a missing folder below to restore it.
          </p>
          <div className="flex flex-wrap gap-1">
            {controller.missingFolderNames.map((name) => (
              <button
                key={`missing:${name}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-amber-200 dark:border-amber-700 bg-white dark:bg-neutral-900 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                onClick={() => controller.restoreMissingFolder(name)}
                title={`Click to re-add "${name}" folder`}
              >
                <CompositeIcon name="folder" size={12} className="flex-shrink-0 text-amber-500/50" sub={{ name: 'plus', position: 'br', bg: 'amber' }} />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate max-w-[140px]">
                  {name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
