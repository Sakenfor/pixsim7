/**
 * Signal Triage Gallery Surface
 *
 * Dedicated UX for validating the signal-based broken-video heuristic.
 * Pre-applies `signal_likely_broken=true` so you only see flagged items;
 * Keep / Flag actions write `media_metadata.signal_metrics.user_override`
 * via the backend. Cards optimistically remove from the list once acted on.
 *
 * Gestures use the `signal-triage` gesture surface (see lib/gestures/surfaces.ts).
 * Defaults: swipe-up = Keep, swipe-down = Flag.
 *
 * Keyboard: K = keep current, F = flag current, ← / → = navigate.
 */

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { setSignalOverride } from '@lib/api/assets';

import { MediaCard } from '@/components/media/MediaCard';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import type { AssetsController } from '../hooks/useAssetsController';
import type { AssetModel } from '../models/asset';

import { GalleryGrid, GallerySurfaceShell } from './shared';

export interface SignalTriageContentProps {
  controller: AssetsController;
}

/** The mutually-exclusive score buckets you can triage, each a registered
 * boolean filter (all now gated to the CURRENT scanner version, so stale
 * prior-heuristic scores no longer leak in). */
type TriageQueue = 'broken' | 'borderline' | 'overridden';

const TRIAGE_QUEUES: { id: TriageQueue; label: string; filter: string }[] = [
  { id: 'broken', label: 'Broken (≥3)', filter: 'signal_likely_broken' },
  { id: 'borderline', label: 'Borderline (1–2)', filter: 'signal_borderline' },
  { id: 'overridden', label: 'Decided', filter: 'signal_overridden' },
];

export function SignalTriageContent({ controller }: SignalTriageContentProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [queue, setQueue] = useState<TriageQueue>('broken');

  // Start from a CLEAN triage state on mount. The asset filter session
  // (`assets_filters`) is shared across every gallery surface, so a stale filter
  // the user left on the main gallery can leak in — combined with the video-only
  // signal buckets it silently yields an EMPTY queue. The worst offender is
  // `media_type=image`: it zeroes every bucket, and because this surface hides the
  // media-type control (`showMediaType={false}`) it's invisible and unclearable
  // from here. So we always force `media_type: 'video'` — a positive value that
  // overwrites any persisted/URL image — alongside the bucket flag. Signal scores
  // only exist on videos, so this never excludes a real candidate.
  useEffect(() => {
    controller.replaceFilters({ signal_likely_broken: true, media_type: 'video' });
    // intentionally only on mount; subsequent edits respect user choices
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch which bucket we're triaging. replaceFilters swaps cleanly (resets to
  // defaults + the one bucket flag + forced video), so the buckets stay mutually
  // exclusive and a stale media_type can't zero the queue.
  const selectQueue = useCallback(
    (q: TriageQueue) => {
      const spec = TRIAGE_QUEUES.find((x) => x.id === q);
      if (!spec) return;
      setQueue(q);
      setFocusedIndex(0);
      controller.replaceFilters({ [spec.filter]: true, media_type: 'video' });
    },
    [controller],
  );

  const focused = controller.assets[focusedIndex];

  const triage = useCallback(
    async (assetId: number, decision: 'clean' | 'broken') => {
      try {
        await setSignalOverride(assetId, decision);
        controller.removeAsset?.(assetId);
        // Step focus back if we just removed past the end
        setFocusedIndex((prev) => Math.min(prev, controller.assets.length - 2));
      } catch (e) {
        console.error('[signal-triage] override failed', assetId, decision, e);
      }
    },
    [controller],
  );

  const handleKeep = useCallback((id: number) => triage(id, 'clean'), [triage]);
  const handleFlag = useCallback((id: number) => triage(id, 'broken'), [triage]);

  useKeyboardShortcuts([
    {
      key: 'k',
      description: 'Keep (override: not broken)',
      callback: () => focused && handleKeep(focused.id),
    },
    {
      key: 'f',
      description: 'Flag (confirm broken)',
      callback: () => focused && handleFlag(focused.id),
    },
    {
      key: 'ArrowRight',
      description: 'Next',
      callback: () =>
        setFocusedIndex((prev) => Math.min(prev + 1, controller.assets.length - 1)),
    },
    {
      key: 'ArrowLeft',
      description: 'Previous',
      callback: () => setFocusedIndex((prev) => Math.max(prev - 1, 0)),
    },
  ]);

  // Auto-clamp focus when list shrinks
  useEffect(() => {
    if (focusedIndex >= controller.assets.length && controller.assets.length > 0) {
      setFocusedIndex(controller.assets.length - 1);
    }
  }, [controller.assets.length, focusedIndex]);

  const headerActions = useMemo(
    () => (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-600">
          {TRIAGE_QUEUES.map((qd) => (
            <button
              key={qd.id}
              type="button"
              onClick={() => selectQueue(qd.id)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                queue === qd.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {qd.label}
            </button>
          ))}
        </div>
        <span className="text-neutral-600 dark:text-neutral-400">
          Remaining: {controller.assets.length}
          {controller.hasMore ? '+' : ''}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          K = Keep · F = Flag · swipe ↑↓
        </span>
      </div>
    ),
    [queue, selectQueue, controller.assets.length, controller.hasMore],
  );

  const renderCard = useCallback(
    (asset: AssetModel, index: number) => {
      const isFocused = index === focusedIndex;
      const score = readSignalScore(asset);
      return (
        <div
          className={`relative border-2 rounded-lg overflow-hidden transition-all ${
            isFocused
              ? 'ring-4 ring-blue-500 ring-offset-2 border-neutral-300 dark:border-neutral-600'
              : 'border-neutral-200 dark:border-neutral-700'
          }`}
          onClick={() => setFocusedIndex(index)}
        >
          {score !== null && (
            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 text-xs font-mono bg-black/70 text-amber-300 rounded">
              score {score}
            </div>
          )}
          <MediaCard
            asset={asset}
            actions={{
              ...controller.getAssetActions(asset),
              onMarkSignalKeep: () => handleKeep(asset.id),
              onMarkSignalFlag: () => handleFlag(asset.id),
            }}
            gestureSurfaceId="signal-triage"
          />
          <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleKeep(asset.id);
                }}
                className="flex-1 text-sm"
              >
                ✓ Keep
              </Button>
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFlag(asset.id);
                }}
                className="flex-1 text-sm"
              >
                ⚠ Flag
              </Button>
            </div>
          </div>
        </div>
      );
    },
    [focusedIndex, controller, handleKeep, handleFlag],
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-3xl mb-3">✓</div>
      <div className="text-lg font-medium text-neutral-700 dark:text-neutral-200">
        Nothing left to triage
      </div>
      <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
        No videos in the {TRIAGE_QUEUES.find((q) => q.id === queue)?.label ?? 'current'} queue.
        Switch queue above, or run the scanner to add more.
      </div>
    </div>
  );

  return (
    <GallerySurfaceShell
      title="Signal Triage"
      subtitle="Validate the broken-video heuristic. Keep = override as not broken; Flag = confirm bad."
      headerActions={headerActions}
      filters={controller.filters}
      onFiltersChange={(updates) => controller.setFilters({ ...updates })}
      showSearch
      showMediaType={false}
      showSort
      filtersLayout="horizontal"
      error={controller.error}
      loading={controller.loading}
      itemCount={controller.assets.length}
    >
      <GalleryGrid
        items={controller.assets}
        renderCard={renderCard}
        getKey={(a) => a.id}
        cardSize={320}
        rowGap={24}
        columnGap={24}
        pagination={{
          currentPage: controller.currentPage,
          totalPages: controller.totalPages,
          hasMore: controller.hasMore,
          loading: controller.loading,
          onPageChange: controller.goToPage,
        }}
        emptyState={emptyState}
      />
    </GallerySurfaceShell>
  );
}

/** Pull the heuristic score out of the asset's media_metadata for the badge. */
function readSignalScore(asset: AssetModel): number | null {
  const meta = (asset as AssetModel & { media_metadata?: Record<string, unknown> }).media_metadata;
  if (!meta || typeof meta !== 'object') return null;
  const sm = (meta as { signal_metrics?: { score?: unknown } }).signal_metrics;
  if (!sm || typeof sm.score !== 'number') return null;
  return sm.score;
}
