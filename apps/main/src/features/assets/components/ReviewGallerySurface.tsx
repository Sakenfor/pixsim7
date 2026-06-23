/**
 * Review Gallery Surface
 *
 * A descriptor for {@link ReviewModeSurface}: a simplified pass for accepting /
 * rejecting / skipping assets. Decisions persist to localStorage (review session
 * state survives reloads) and tint the card; nothing is written to the backend.
 * Keyboard: A = accept, R = reject, S = skip, ←/→ navigate, ? = help.
 *
 * Only the review-specific bits live here (the decision verbs + persisted sets,
 * the progress stats, the card tinting). The focused-grid scaffold is shared.
 */

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useMemo } from 'react';

import { usePersistentSet } from '@/hooks/usePersistentState';

import type { AssetsController } from '../hooks/useAssetsController';
import type { AssetModel } from '../models/asset';

import { DynamicFilters } from './DynamicFilters';
import { ReviewModeSurface, type ReviewDecision } from './ReviewModeSurface';

export interface ReviewSurfaceContentProps {
  controller: AssetsController;
}

const HELP_ROWS = [
  { keys: 'A', label: 'Accept asset' },
  { keys: 'R', label: 'Reject asset' },
  { keys: 'S', label: 'Skip asset' },
  { keys: '←/→', label: 'Navigate' },
  { keys: '?', label: 'Toggle help' },
];

export function ReviewSurfaceContent({ controller }: ReviewSurfaceContentProps) {
  // Persistent review state — survives page reloads.
  const [reviewedAssets, setReviewedAssets] = usePersistentSet('review-session:reviewed', new Set());
  const [acceptedAssets, setAcceptedAssets] = usePersistentSet('review-session:accepted', new Set());
  const [rejectedAssets, setRejectedAssets] = usePersistentSet('review-session:rejected', new Set());

  const handleAccept = useCallback(
    (assetId: string | number) => {
      const id = String(assetId);
      setReviewedAssets((prev) => new Set(prev).add(id));
      setAcceptedAssets((prev) => new Set(prev).add(id));
      setRejectedAssets((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [setReviewedAssets, setAcceptedAssets, setRejectedAssets],
  );

  const handleReject = useCallback(
    (assetId: string | number) => {
      const id = String(assetId);
      setReviewedAssets((prev) => new Set(prev).add(id));
      setRejectedAssets((prev) => new Set(prev).add(id));
      setAcceptedAssets((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [setReviewedAssets, setRejectedAssets, setAcceptedAssets],
  );

  const handleSkip = useCallback(
    (assetId: string | number) => {
      const id = String(assetId);
      const drop = (prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      };
      setReviewedAssets(drop);
      setAcceptedAssets(drop);
      setRejectedAssets(drop);
    },
    [setReviewedAssets, setAcceptedAssets, setRejectedAssets],
  );

  const stats = useMemo(
    () => ({
      total: controller.assets.length,
      reviewed: reviewedAssets.size,
      accepted: acceptedAssets.size,
      rejected: rejectedAssets.size,
    }),
    [controller.assets.length, reviewedAssets.size, acceptedAssets.size, rejectedAssets.size],
  );

  const clearSession = useCallback(() => {
    if (confirm('Clear all review progress? This cannot be undone.')) {
      setReviewedAssets(new Set());
      setAcceptedAssets(new Set());
      setRejectedAssets(new Set());
    }
  }, [setReviewedAssets, setAcceptedAssets, setRejectedAssets]);

  const decisions = useMemo<ReviewDecision[]>(
    () => [
      {
        id: 'accept',
        label: '✓ Accept',
        hotkey: 'a',
        hotkeyLabel: 'A',
        run: (asset) => handleAccept(asset.id),
        isActive: (asset) => acceptedAssets.has(String(asset.id)),
      },
      {
        id: 'reject',
        label: '✗ Reject',
        hotkey: 'r',
        hotkeyLabel: 'R',
        run: (asset) => handleReject(asset.id),
        isActive: (asset) => rejectedAssets.has(String(asset.id)),
      },
      {
        id: 'skip',
        label: '↺',
        hotkey: 's',
        hotkeyLabel: 'S',
        run: (asset) => handleSkip(asset.id),
        // Surface the undo only once an asset has been decided.
        visibleWhen: (asset) => reviewedAssets.has(String(asset.id)),
      },
    ],
    [handleAccept, handleReject, handleSkip, acceptedAssets, rejectedAssets, reviewedAssets],
  );

  const cardActions = useCallback(
    (asset: AssetModel) => ({
      onApprove: () => handleAccept(asset.id),
      onReject: () => handleReject(asset.id),
    }),
    [handleAccept, handleReject],
  );

  const cardClassName = useCallback(
    (asset: AssetModel) => {
      const id = String(asset.id);
      if (acceptedAssets.has(id)) return 'border-green-500 bg-green-50 dark:bg-green-900/10';
      if (rejectedAssets.has(id)) return 'border-red-500 bg-red-50 dark:bg-red-900/10';
      return '';
    },
    [acceptedAssets, rejectedAssets],
  );

  const headerActions = (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">
        Progress: {stats.reviewed}/{stats.total}
      </span>
      <span className="rounded bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        ✓ {stats.accepted} Accepted
      </span>
      <span className="rounded bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">
        ✗ {stats.rejected} Rejected
      </span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">? = shortcuts</span>
      {stats.reviewed > 0 && (
        <Button variant="secondary" onClick={clearSession} className="text-xs">
          Clear Session
        </Button>
      )}
    </div>
  );

  const filtersContent = (
    <DynamicFilters
      filters={controller.filters}
      onFiltersChange={(f) => controller.setFilters(f)}
    />
  );

  return (
    <ReviewModeSurface
      controller={controller}
      title="Asset Review"
      headerActions={headerActions}
      filtersContent={filtersContent}
      decisions={decisions}
      cardActions={cardActions}
      cardClassName={cardClassName}
      overlayPresetId="media-card-review"
      helpRows={HELP_ROWS}
    />
  );
}
