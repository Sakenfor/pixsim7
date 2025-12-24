/**
 * Review Gallery Surface
 *
 * Simplified gallery view optimized for reviewing and curating assets.
 * Features:
 * - Larger card view
 * - Accept/reject actions
 * - Minimal filters (focus on reviewing)
 */

import { useState, useMemo, useEffect } from 'react';
import { useGallerySurfaceController } from '@features/gallery';
import { MediaCard } from '@/components/media/MediaCard';
import { Button } from '@pixsim7/shared.ui';
import { usePersistentSet } from '@/hooks/usePersistentState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { AssetDetailModal } from './AssetDetailModal';
import { GallerySurfaceShell, mediaCardPropsFromAsset } from './shared';

export function ReviewGallerySurface() {
  const [focusedAssetIndex, setFocusedAssetIndex] = useState<number>(0);
  const [showHelp, setShowHelp] = useState(false);

  // Use the gallery surface controller for asset loading and generation actions
  const controller = useGallerySurfaceController({
    mode: 'review',
    filters: { sort: 'new' },
  });

  // Persistent review state - survives page reloads
  const [reviewedAssets, setReviewedAssets] = usePersistentSet('review-session:reviewed', new Set());
  const [acceptedAssets, setAcceptedAssets] = usePersistentSet('review-session:accepted', new Set());
  const [rejectedAssets, setRejectedAssets] = usePersistentSet('review-session:rejected', new Set());

  const handleAccept = (assetId: string) => {
    setReviewedAssets(prev => new Set(prev).add(assetId));
    setAcceptedAssets(prev => new Set(prev).add(assetId));
    setRejectedAssets(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  const handleReject = (assetId: string) => {
    setReviewedAssets(prev => new Set(prev).add(assetId));
    setRejectedAssets(prev => new Set(prev).add(assetId));
    setAcceptedAssets(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  const handleSkip = (assetId: string) => {
    setReviewedAssets(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    setAcceptedAssets(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    setRejectedAssets(prev => {
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
  };

  const stats = useMemo(
    () => ({
      total: controller.assets.length,
      reviewed: reviewedAssets.size,
      accepted: acceptedAssets.size,
      rejected: rejectedAssets.size,
      remaining: controller.assets.length - reviewedAssets.size,
    }),
    [controller.assets.length, reviewedAssets.size, acceptedAssets.size, rejectedAssets.size]
  );

  const clearSession = () => {
    if (confirm('Clear all review progress? This cannot be undone.')) {
      setReviewedAssets(new Set());
      setAcceptedAssets(new Set());
      setRejectedAssets(new Set());
    }
  };

  // Get current focused asset
  const focusedAsset = controller.assets[focusedAssetIndex];

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'a',
      description: 'Accept current asset',
      callback: () => {
        if (focusedAsset) {
          handleAccept(focusedAsset.id);
          setFocusedAssetIndex((prev) => Math.min(prev + 1, controller.assets.length - 1));
        }
      },
    },
    {
      key: 'r',
      description: 'Reject current asset',
      callback: () => {
        if (focusedAsset) {
          handleReject(focusedAsset.id);
          setFocusedAssetIndex((prev) => Math.min(prev + 1, controller.assets.length - 1));
        }
      },
    },
    {
      key: 's',
      description: 'Skip current asset',
      callback: () => {
        if (focusedAsset) {
          handleSkip(focusedAsset.id);
          setFocusedAssetIndex((prev) => Math.min(prev + 1, controller.assets.length - 1));
        }
      },
    },
    {
      key: 'ArrowRight',
      description: 'Next asset',
      callback: () => setFocusedAssetIndex((prev) => Math.min(prev + 1, controller.assets.length - 1)),
    },
    {
      key: 'ArrowLeft',
      description: 'Previous asset',
      callback: () => setFocusedAssetIndex(prev => Math.max(prev - 1, 0)),
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      callback: () => setShowHelp(prev => !prev),
      preventDefault: false,
    },
  ]);

  // Auto-focus when items change
  useEffect(() => {
    if (focusedAssetIndex >= controller.assets.length && controller.assets.length > 0) {
      setFocusedAssetIndex(controller.assets.length - 1);
    }
  }, [controller.assets.length, focusedAssetIndex]);

  // Header actions: help button + progress stats
  const headerActions = (
    <div className="flex items-center gap-4 text-sm">
      <button
        onClick={() => setShowHelp(true)}
        className="px-2 py-0.5 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        title="Keyboard shortcuts"
      >
        ?
      </button>
      <span className="text-neutral-600 dark:text-neutral-400">
        Progress: {stats.reviewed}/{stats.total}
      </span>
      <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
        ✓ {stats.accepted} Accepted
      </span>
      <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
        ✗ {stats.rejected} Rejected
      </span>
      {stats.reviewed > 0 && (
        <Button variant="secondary" onClick={clearSession} className="text-xs">
          🗑️ Clear Session
        </Button>
      )}
    </div>
  );

  // Large card grid for review
  const reviewGrid = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {controller.assets.map((asset, index) => {
        const isAccepted = acceptedAssets.has(asset.id);
        const isRejected = rejectedAssets.has(asset.id);
        const isReviewed = reviewedAssets.has(asset.id);
        const isFocused = index === focusedAssetIndex;

        return (
          <div
            key={asset.id}
            className={`border-2 rounded-lg overflow-hidden transition-all ${
              isFocused
                ? 'ring-4 ring-blue-500 ring-offset-2'
                : ''
            } ${
              isAccepted
                ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                : isRejected
                ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => setFocusedAssetIndex(index)}
          >
            <MediaCard
              {...mediaCardPropsFromAsset(asset)}
              actions={controller.getAssetActions(asset)}
              contextMenuAsset={asset}
              contextMenuSelection={controller.selectedAssets}
            />

            {/* Review Actions */}
            <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
              <div className="flex gap-2">
                <Button
                  variant={isAccepted ? 'primary' : 'secondary'}
                  onClick={() => handleAccept(asset.id)}
                  className="flex-1 text-sm"
                >
                  ✓ Accept
                </Button>
                <Button
                  variant={isRejected ? 'primary' : 'secondary'}
                  onClick={() => handleReject(asset.id)}
                  className="flex-1 text-sm"
                >
                  ✗ Reject
                </Button>
                {isReviewed && (
                  <Button
                    variant="secondary"
                    onClick={() => handleSkip(asset.id)}
                    className="text-sm"
                  >
                    ↺
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Keyboard Shortcuts Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowHelp(false)}>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">A</kbd><span>Accept asset</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">R</kbd><span>Reject asset</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">S</kbd><span>Skip asset</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">←/→</kbd><span>Navigate</span></div>
              <div className="flex justify-between"><kbd className="px-2 py-1 bg-neutral-100 dark:bg-neutral-700 rounded">?</kbd><span>Toggle help</span></div>
            </div>
            <Button variant="primary" onClick={() => setShowHelp(false)} className="mt-4 w-full">
              Close
            </Button>
          </div>
        </div>
      )}

      <GallerySurfaceShell
        title="Asset Review"
        headerActions={headerActions}
        filters={controller.filters}
        onFiltersChange={controller.updateFilters}
        showSearch
        showMediaType={false}
        showSort
        filtersLayout="horizontal"
        error={controller.error}
        loading={controller.loading}
        hasMore={controller.hasMore}
        onLoadMore={controller.loadMore}
        itemCount={controller.assets.length}
        loadMoreMode="button"
      >
        {reviewGrid}
      </GallerySurfaceShell>

      {/* Asset Detail Modal - uses shared store */}
      <AssetDetailModal />
    </>
  );
}
