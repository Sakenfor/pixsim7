/**
 * LocalBatchToolsButton — ingestion batch-tools dropdown for local folders.
 *
 * Extracted verbatim from LocalFoldersContent so the generic SourceGalleryView
 * can render it through its `renderToolbar` slot. Owns its own popover state, so
 * it must be a real component (hooks) rather than a render-prop body. Scope of
 * the `triage-toolbar` checkpoint; lives here for now.
 */

import { Dropdown, DropdownDivider, DropdownItem } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Icons } from '@lib/icons';

import type { LocalFoldersController } from '@/types/localSources';

import {
  canUploadToLibraryFromState,
  isFailedUploadState,
  isPendingUploadState,
  resolveLocalUploadState,
} from '../../lib/localAssetState';
import { hasValidStoredHash } from '../../lib/localHashing';
import { getUploadCapableProviders } from '../../lib/resolveUploadTarget';
import type { LocalAssetModel } from '../../types/localFolderMeta';

export interface LocalBatchToolsButtonProps {
  /** Items in the active scope (drilled group or filtered set). */
  visibleItems: LocalAssetModel[];
  /** Items on the current page (for "hash this page"). */
  pageItems: LocalAssetModel[];
  uploadStatus: LocalFoldersController['uploadStatus'];
  hashingProgress: LocalFoldersController['hashingProgress'];
  hashingPaused: boolean;
  hashAssets: (keys: string[]) => void;
  recheckBackend: () => void;
  onUpload: (asset: LocalAssetModel) => void;
  onUploadToProvider: (asset: LocalAssetModel, providerId: string) => Promise<void>;
}

export function LocalBatchToolsButton({
  visibleItems,
  pageItems,
  uploadStatus,
  hashingProgress,
  hashingPaused,
  hashAssets,
  recheckBackend,
  onUpload,
  onUploadToProvider,
}: LocalBatchToolsButtonProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement>(null);
  const batchUploadingRef = useRef(false);

  const isHashableUnhashed = useCallback(
    (asset: LocalAssetModel) => {
      // Keep "Hash unhashed" aligned with backend hashing rules:
      // uploaded-success assets are intentionally skipped by hasher.
      if (asset.last_upload_status === 'success') return false;
      return !hasValidStoredHash(asset);
    },
    [],
  );

  const unhashedCount = useMemo(
    () => visibleItems.filter(isHashableUnhashed).length,
    [visibleItems, isHashableUnhashed],
  );

  const pageUnhashedKeys = useMemo(
    () => pageItems.filter(isHashableUnhashed).map((a) => a.key),
    [pageItems, isHashableUnhashed],
  );

  const { pendingUploadCount, failedUploadCount } = useMemo(() => {
    let pending = 0;
    let failed = 0;
    for (const a of visibleItems) {
      const state = resolveLocalUploadState(a, uploadStatus);
      if (isPendingUploadState(state)) pending++;
      else if (isFailedUploadState(state)) failed++;
    }
    return { pendingUploadCount: pending, failedUploadCount: failed };
  }, [visibleItems, uploadStatus]);

  const handleHashUnhashed = useCallback(() => {
    // Hash exactly the items the "Hash unhashed (N)" count was computed over.
    // visibleItems spans the full folder scope (incl. nested subfolders), so we
    // must hash by key — delegating to hashFolder() would silently drop every
    // asset that lives in a subfolder (isAssetDirectlyInFolderPath excludes them)
    // and would only ever process one of several selected root folders.
    const unhashedKeys = visibleItems.filter(isHashableUnhashed).map((a) => a.key);
    if (unhashedKeys.length === 0) return;
    hashAssets(unhashedKeys);
    setToolsOpen(false);
  }, [hashAssets, visibleItems, isHashableUnhashed]);

  const handleHashCurrentPage = useCallback(() => {
    if (pageUnhashedKeys.length === 0) return;
    hashAssets(pageUnhashedKeys);
    setToolsOpen(false);
  }, [hashAssets, pageUnhashedKeys]);

  const uploadCapableProviders = useMemo(() => getUploadCapableProviders(), []);

  const handleBatchUpload = useCallback(async (target: 'library' | string) => {
    if (batchUploadingRef.current) return;
    batchUploadingRef.current = true;
    setToolsOpen(false);

    const pending = visibleItems.filter((asset) => {
      const status = resolveLocalUploadState(asset, uploadStatus);
      if (status === 'uploading') return false;

      if (target === 'library') {
        return canUploadToLibraryFromState(status);
      }

      const normalizedTarget = target.trim().toLowerCase();
      const lastProviderId = String(asset.last_upload_provider_id || '').trim().toLowerCase();
      const uploadedToSelectedProvider = status === 'success' && lastProviderId === normalizedTarget;
      return !uploadedToSelectedProvider;
    });

    const CONCURRENCY = 3;
    let cursor = 0;

    const runWorker = async () => {
      while (cursor < pending.length) {
        const asset = pending[cursor++];
        try {
          if (target === 'library') {
            await onUpload(asset);
          } else {
            await onUploadToProvider(asset, target);
          }
        } catch { /* individual errors handled inside */ }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, runWorker));
    batchUploadingRef.current = false;
  }, [visibleItems, uploadStatus, onUpload, onUploadToProvider]);

  const uploadActionCount = pendingUploadCount + failedUploadCount;
  const hashedCount = visibleItems.length - unhashedCount;
  const hasToolActions = unhashedCount > 0 || uploadActionCount > 0 || hashedCount > 0;
  const toolsBadgeCount = unhashedCount + uploadActionCount;
  const hashRun = hashingProgress;
  const hashRunPaused = !!hashRun && hashingPaused;
  const hashRunActive = !!hashRun && !hashingPaused;

  if (!hasToolActions) return null;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={toolsBtnRef}
        type="button"
        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition-colors relative"
        title={hashRun
          ? `Batch tools • Hash ${hashRun.done}/${hashRun.total}${hashRunPaused ? ' (paused)' : ''}`
          : 'Batch tools'}
        onClick={() => setToolsOpen((v) => !v)}
      >
        <Icons.wrench size={14} />
        {hashRun && (
          <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5">
            {hashRunActive && (
              <span className="absolute inset-0 rounded-full bg-emerald-500/60 animate-ping" />
            )}
            <span
              className={`absolute inset-0 rounded-full ring-2 ring-neutral-50 dark:ring-neutral-950 ${
                hashRunPaused ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
          </span>
        )}
        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-amber-500 text-[9px] font-medium text-white flex items-center justify-center px-0.5 leading-none">
          {toolsBadgeCount > 99 ? '99+' : toolsBadgeCount}
        </span>
      </button>
      <Dropdown
        isOpen={toolsOpen}
        onClose={() => setToolsOpen(false)}
        position="bottom-left"
        triggerRef={toolsBtnRef}
        minWidth="200px"
        className="z-50"
      >
        {hashRun && (
          <>
            <DropdownItem
              icon={<Icons.loader size={12} className={hashRunActive ? 'animate-spin' : undefined} />}
              disabled
            >
              {hashRunPaused
                ? `Hash paused (${hashRun.done}/${hashRun.total})`
                : `Hashing (${hashRun.done}/${hashRun.total})`}
            </DropdownItem>
            <DropdownDivider />
          </>
        )}
        {unhashedCount > 0 && !hashingProgress && (
          <DropdownItem
            icon={<Icons.hash size={12} />}
            onClick={handleHashUnhashed}
          >
            Hash unhashed ({unhashedCount})
          </DropdownItem>
        )}
        {pageUnhashedKeys.length > 0
          && pageUnhashedKeys.length < unhashedCount
          && !hashingProgress && (
          <DropdownItem
            icon={<Icons.hash size={12} />}
            onClick={handleHashCurrentPage}
          >
            Hash this page ({pageUnhashedKeys.length})
          </DropdownItem>
        )}
        <DropdownItem
          icon={<Icons.search size={12} />}
          onClick={() => { recheckBackend(); setToolsOpen(false); }}
        >
          Check library
        </DropdownItem>
        {uploadActionCount > 0 && (
          <DropdownDivider />
        )}
        {uploadActionCount > 0 && (
          <DropdownItem
            icon={<Icons.upload size={12} />}
            onClick={() => handleBatchUpload('library')}
            disabled={batchUploadingRef.current}
          >
            Upload to library ({uploadActionCount})
          </DropdownItem>
        )}
        {uploadActionCount > 0 && uploadCapableProviders.map((provider) => (
          <DropdownItem
            key={provider.providerId}
            icon={<Icons.upload size={12} />}
            onClick={() => handleBatchUpload(provider.providerId)}
            disabled={batchUploadingRef.current}
          >
            Upload to {provider.name} ({uploadActionCount})
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}
