/**
 * Review Gallery Surface
 *
 * Simplified gallery view optimized for reviewing and curating assets.
 * Features:
 * - Larger card view
 * - Accept/reject actions
 * - Minimal filters (focus on reviewing)
 */

import { useState, useMemo } from 'react';
import { useAssets } from '../../hooks/useAssets';
import { MediaCard } from '../media/MediaCard';
import { Button } from '@pixsim7/shared.ui';
import type { GalleryAsset } from '../../lib/gallery/types';

export function ReviewGallerySurface() {
  const [filters, setFilters] = useState({
    q: '',
    sort: 'new' as const,
  });

  const { items, loadMore, loading, error, hasMore } = useAssets({ filters });
  const [reviewedAssets, setReviewedAssets] = useState<Set<string>>(new Set());
  const [acceptedAssets, setAcceptedAssets] = useState<Set<string>>(new Set());
  const [rejectedAssets, setRejectedAssets] = useState<Set<string>>(new Set());

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

  const stats = useMemo(() => ({
    total: items.length,
    reviewed: reviewedAssets.size,
    accepted: acceptedAssets.size,
    rejected: rejectedAssets.size,
    remaining: items.length - reviewedAssets.size,
  }), [items.length, reviewedAssets.size, acceptedAssets.size, rejectedAssets.size]);

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Asset Review</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">
            Progress: {stats.reviewed}/{stats.total}
          </span>
          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
            ✓ {stats.accepted} Accepted
          </span>
          <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
            ✗ {stats.rejected} Rejected
          </span>
        </div>
      </div>

      {/* Simplified Filters */}
      <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700">
        <div className="flex gap-2 items-center">
          <input
            placeholder="Search..."
            className="px-2 py-1 text-sm border rounded flex-1"
            value={filters.q}
            onChange={(e) => setFilters(prev => ({ ...prev, q: e.target.value }))}
          />
          <select
            className="px-2 py-1 text-sm border rounded"
            value={filters.sort}
            onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value as any }))}
          >
            <option value="new">Newest First</option>
            <option value="old">Oldest First</option>
          </select>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* Large Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map(asset => {
          const isAccepted = acceptedAssets.has(asset.id);
          const isRejected = rejectedAssets.has(asset.id);
          const isReviewed = reviewedAssets.has(asset.id);

          return (
            <div
              key={asset.id}
              className={`border-2 rounded-lg overflow-hidden transition-all ${
                isAccepted
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                  : isRejected
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
                  : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <MediaCard
                id={asset.id}
                mediaType={asset.media_type}
                providerId={asset.provider_id}
                providerAssetId={asset.provider_asset_id}
                thumbUrl={asset.thumbnail_url}
                remoteUrl={asset.remote_url}
                width={asset.width}
                height={asset.height}
                durationSec={asset.duration_sec}
                tags={asset.tags}
                description={asset.description}
                createdAt={asset.created_at}
                status={asset.sync_status}
                providerStatus={asset.provider_status}
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

      {/* Load More */}
      <div className="pt-4">
        {hasMore && (
          <button
            disabled={loading}
            onClick={loadMore}
            className="border px-4 py-2 rounded"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        )}
        {!hasMore && <div className="text-sm text-neutral-500">No more assets</div>}
      </div>
    </div>
  );
}
