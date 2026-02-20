import type { RefObject } from 'react';

import { CompositeIcon, Icons } from '@lib/icons';

import type { LocalFoldersController } from '@/types/localSources';

import type { LocalAsset } from '../../stores/localFoldersStore';
import { TreeFolderView } from '../TreeFolderView';

export interface LocalFoldersSidebarProps {
  controller: LocalFoldersController;
  providers: Array<{ id: string; name: string }>;
  folderNames: Record<string, string>;
  hashingPhaseLabel: string;
  hashingBytesLabel: string | null;
  favoriteFoldersSet: ReadonlySet<string>;
  toggleFavoriteFolder: (path: string) => void;
  handleTreeOpen: (asset: LocalAsset, resolvedPreviewUrl?: string) => Promise<void>;
  sidebarScrollRef: RefObject<HTMLDivElement | null>;
  folderTreeScrollRef: RefObject<HTMLDivElement | null>;
}

export function LocalFoldersSidebar({
  controller,
  providers,
  folderNames,
  hashingPhaseLabel,
  hashingBytesLabel,
  favoriteFoldersSet,
  toggleFavoriteFolder,
  handleTreeOpen,
  sidebarScrollRef,
  folderTreeScrollRef,
}: LocalFoldersSidebarProps) {
  return (
    <div ref={sidebarScrollRef} className="w-64 flex-shrink-0 space-y-4 overflow-y-auto">
      {/* Status + support/error */}
      <div className="space-y-2">
        {/* Scanning progress indicator */}
        {controller.scanning && (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="font-medium">Scanning folder...</span>
            </div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 space-y-0.5">
              <div>Files scanned: {controller.scanning.scanned.toLocaleString()}</div>
              <div>Media found: {controller.scanning.found.toLocaleString()}</div>
              {controller.scanning.currentPath && (
                <div className="truncate opacity-75" title={controller.scanning.currentPath}>
                  {controller.scanning.currentPath}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hashing progress indicator */}
        {controller.hashingProgress && (
          <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            {!controller.hashingPaused && (
              <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
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
      </div>

      {/* Provider selection */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Upload provider (optional)
        </label>
        <select
          className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-accent focus:border-accent"
          value={controller.providerId || ''}
          onChange={(e) => controller.setProviderId(e.target.value || undefined)}
        >
          <option value="">Library only (no provider)</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Missing folders warning */}
      {controller.missingFolderNames.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
            <Icons.alertTriangle size={14} />
            <span className="font-medium">Some folders need to be re-added</span>
          </div>
          <p className="text-amber-600 dark:text-amber-400 text-[10px] mb-2">
            Browser storage was cleared. Click a missing folder below to restore it.
          </p>
          <button
            className="text-[10px] text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 underline"
            onClick={controller.dismissMissingFolders}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Folder selection + list */}
      {(controller.folders.length > 0 || controller.missingFolderNames.length > 0) && (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
          <div className="text-[11px] font-medium p-2 text-neutral-500 dark:text-neutral-400 px-3 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700">
            <Icons.folderTree size={12} />
            <span>All Local Folders</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {/* Missing folder placeholders */}
            {controller.missingFolderNames.map((name) => (
              <button
                key={`missing:${name}`}
                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0 group"
                onClick={() => controller.restoreMissingFolder(name)}
                title={`Click to re-add "${name}" folder`}
              >
                <CompositeIcon name="folder" size={14} className="flex-shrink-0 text-amber-500/50" sub={{ name: 'plus', position: 'br', bg: 'amber' }} />
                <span className="text-xs text-amber-600 dark:text-amber-400 truncate flex-1">
                  {name}
                </span>
                <span className="text-[10px] text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Click to restore
                </span>
              </button>
            ))}

            {/* Real folders tree */}
            {controller.folders.length > 0 && (
              <TreeFolderView
                assets={controller.assets}
                folderNames={folderNames}
                folderOrder={controller.folders.map(f => f.id)}
                onFileClick={handleTreeOpen}
                onPreview={controller.loadPreview}
                previews={controller.previews}
                uploadStatus={controller.uploadStatus}
                onUpload={controller.uploadOne}
                providerId={controller.providerId}
                compactMode={true}
                selectedFolderPath={controller.selectedFolderPath || undefined}
                onFolderSelect={controller.setSelectedFolderPath}
                onRemoveFolder={controller.removeFolder}
                onRefreshFolder={controller.refreshFolder}
                onHashFolder={controller.hashFolder}
                favoriteFolders={favoriteFoldersSet}
                onToggleFavorite={toggleFavoriteFolder}
                scrollContainerRef={folderTreeScrollRef}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
