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

import { GallerySurfaceShell } from './shared';

export interface SignalTriageContentProps {
  controller: AssetsController;
}

export function SignalTriageContent({ controller }: SignalTriageContentProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Pre-apply signal_likely_broken filter on mount. Don't fight the user if they
  // toggle it off — they may want to view their overridden items via the
  // signal_overridden filter.
  useEffect(() => {
    if (!controller.filters?.signal_likely_broken) {
      controller.setFilters({ signal_likely_broken: true });
    }
    // intentionally only on mount; subsequent edits respect user choices
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span className="text-neutral-600 dark:text-neutral-400">
          Remaining: {controller.assets.length}
          {controller.hasMore ? '+' : ''}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          K = Keep · F = Flag · swipe ↑↓
        </span>
      </div>
    ),
    [controller.assets.length, controller.hasMore],
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
      hasMore={controller.hasMore}
      onLoadMore={controller.loadMore}
      itemCount={controller.assets.length}
      loadMoreMode="button"
    >
      <TriageGrid
        assets={controller.assets}
        focusedIndex={focusedIndex}
        onFocus={setFocusedIndex}
        onKeep={handleKeep}
        onFlag={handleFlag}
        getActions={controller.getAssetActions}
      />
    </GallerySurfaceShell>
  );
}

interface TriageGridProps {
  assets: AssetModel[];
  focusedIndex: number;
  onFocus: (index: number) => void;
  onKeep: (id: number) => void;
  onFlag: (id: number) => void;
  getActions: AssetsController['getAssetActions'];
}

function TriageGrid({
  assets,
  focusedIndex,
  onFocus,
  onKeep,
  onFlag,
  getActions,
}: TriageGridProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-3xl mb-3">✓</div>
        <div className="text-lg font-medium text-neutral-700 dark:text-neutral-200">
          Nothing left to triage
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          No videos in the broken queue. Run the scanner if you want to add more.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {assets.map((asset, index) => {
        const isFocused = index === focusedIndex;
        const score = readSignalScore(asset);
        return (
          <div
            key={asset.id}
            className={`relative border-2 rounded-lg overflow-hidden transition-all ${
              isFocused
                ? 'ring-4 ring-blue-500 ring-offset-2 border-neutral-300 dark:border-neutral-600'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            onClick={() => onFocus(index)}
          >
            {score !== null && (
              <div className="absolute top-2 left-2 z-10 px-2 py-0.5 text-xs font-mono bg-black/70 text-amber-300 rounded">
                score {score}
              </div>
            )}
            <MediaCard
              asset={asset}
              actions={{
                ...getActions(asset),
                onMarkSignalKeep: () => onKeep(asset.id),
                onMarkSignalFlag: () => onFlag(asset.id),
              }}
              gestureSurfaceId="signal-triage"
            />
            <div className="p-3 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKeep(asset.id);
                  }}
                  className="flex-1 text-sm"
                >
                  ✓ Keep
                </Button>
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFlag(asset.id);
                  }}
                  className="flex-1 text-sm"
                >
                  ⚠ Flag
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
