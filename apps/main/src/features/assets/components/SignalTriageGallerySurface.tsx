/**
 * Signal Triage Gallery Surface
 *
 * A descriptor for {@link ReviewModeSurface}: validate the signal-based
 * broken-video heuristic. Keep / Flag write `media_metadata.signal_metrics
 * .user_override` via the backend and optimistically remove the card from the
 * queue. Gestures use the `signal-triage` gesture surface (swipe-up = Keep,
 * swipe-down = Flag; see lib/gestures/surfaces.ts). Keyboard: K = keep, F = flag.
 *
 * This surface owns only what differs from a plain review pass: the three
 * mutually-exclusive score-bucket queues, the score badge, and the backend
 * override decision. The focused-grid scaffold lives in ReviewModeSurface.
 */

import { useCallback, useMemo, useState } from 'react';

import { setSignalOverride } from '@lib/api/assets';

import type { AssetsController } from '../hooks/useAssetsController';
import type { AssetModel } from '../models/asset';

import { DynamicFilters } from './DynamicFilters';
import { ReviewModeSurface, type ReviewDecision } from './ReviewModeSurface';

export interface SignalTriageContentProps {
  controller: AssetsController;
  /** Card edge length, driven by the shared gallery layout slider. */
  cardSize?: number;
}

/** The mutually-exclusive score buckets you can triage, each a registered
 * boolean filter (all gated to the CURRENT scanner version, so stale
 * prior-heuristic scores no longer leak in). */
type TriageQueue = 'broken' | 'borderline' | 'overridden';

const TRIAGE_QUEUES: { id: TriageQueue; label: string; filter: string }[] = [
  { id: 'broken', label: 'Broken (≥3)', filter: 'signal_likely_broken' },
  { id: 'borderline', label: 'Borderline (1–2)', filter: 'signal_borderline' },
  { id: 'overridden', label: 'Decided', filter: 'signal_overridden' },
];

/** Registry filter keys the triage surface owns directly — hidden from the shared
 * DynamicFilters chip bar so they can't fight the queue scope: the three bucket
 * flags are driven by {@link SignalBucketSwitcher}, and media_type is force-pinned
 * to `video` by the queue selector (signal scores only exist on videos). */
const TRIAGE_OWNED_FILTER_KEYS = [
  'signal_likely_broken',
  'signal_borderline',
  'signal_overridden',
  'signal_likely_clean',
  'media_type',
];

/** Segmented control for picking which mutually-exclusive score bucket to triage. */
function SignalBucketSwitcher({
  queue,
  onSelect,
}: {
  queue: TriageQueue;
  onSelect: (q: TriageQueue) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Queue
      </span>
      <div className="flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
        {TRIAGE_QUEUES.map((qd) => (
          <button
            key={qd.id}
            type="button"
            onClick={() => onSelect(qd.id)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              queue === qd.id
                ? 'bg-accent text-accent-text'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {qd.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SignalTriageContent({ controller, cardSize }: SignalTriageContentProps) {
  const [queue, setQueue] = useState<TriageQueue>('broken');

  // Switch which bucket we're triaging, replacing the whole filter slate.
  //
  // We set ALL three bucket flags every time (chosen = true, the rest = false),
  // not just the chosen one. `replaceFilters` resets in-memory state to a clean
  // slate, but persistence only rewrites the URL/session keys it's handed — a
  // sibling flag we *omit* would linger in the URL and reappear on the next read.
  // Sending every key forces it to be cleared. The `false` siblings correctly
  // mean "no condition" (each backend bucket is `... if v else None`); this
  // relies on useFilterPersistence coercing the persisted "false" back to a real
  // boolean, otherwise it reads as a truthy string and all three buckets apply
  // at once — mutually exclusive, so the queue silently zeroes.
  //
  // `media_type: 'video'` is a positive constraint (signal scores only exist on
  // videos) that also overwrites any stale persisted media_type leaking in from
  // the shared `assets_filters` session — important because the media-type key is
  // hidden from this surface's chip bar (see TRIAGE_OWNED_FILTER_KEYS), so it's
  // otherwise unclearable here.
  const selectQueue = useCallback(
    (q: TriageQueue) => {
      setQueue(q);
      const flags = Object.fromEntries(
        TRIAGE_QUEUES.map((x) => [x.filter, x.id === q]),
      );
      controller.replaceFilters({ ...flags, media_type: 'video' });
    },
    [controller],
  );

  const triage = useCallback(
    async (assetId: number, decision: 'clean' | 'broken') => {
      try {
        await setSignalOverride(assetId, decision);
        controller.removeAsset?.(assetId);
      } catch (e) {
        console.error('[signal-triage] override failed', assetId, decision, e);
      }
    },
    [controller],
  );

  const decisions = useMemo<ReviewDecision[]>(
    () => [
      {
        id: 'keep',
        label: '✓ Keep',
        hotkey: 'k',
        hotkeyLabel: 'K',
        variant: 'primary',
        advance: 'stay',
        run: (asset) => triage(asset.id, 'clean'),
      },
      {
        id: 'flag',
        label: '⚠ Flag',
        hotkey: 'f',
        hotkeyLabel: 'F',
        variant: 'secondary',
        advance: 'stay',
        run: (asset) => triage(asset.id, 'broken'),
      },
    ],
    [triage],
  );

  const cardActions = useCallback(
    (asset: AssetModel) => ({
      onMarkSignalKeep: () => triage(asset.id, 'clean'),
      onMarkSignalFlag: () => triage(asset.id, 'broken'),
    }),
    [triage],
  );

  const headerActions = (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">
        Remaining: {controller.assets.length}
        {controller.hasMore ? '+' : ''}
      </span>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">
        K = Keep · F = Flag · swipe ↑↓
      </span>
    </div>
  );

  // Queue segmented control + the same registry-driven chip bar the default
  // gallery uses (minus triage-owned keys), so the filter UX matches.
  const filtersContent = (
    <div className="space-y-3">
      <SignalBucketSwitcher queue={queue} onSelect={selectQueue} />
      <DynamicFilters
        filters={controller.filters}
        onFiltersChange={(f) => controller.setFilters(f)}
        exclude={TRIAGE_OWNED_FILTER_KEYS}
      />
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 text-3xl">✓</div>
      <div className="text-lg font-medium text-neutral-700 dark:text-neutral-200">
        Nothing left to triage
      </div>
      <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        No videos in the {TRIAGE_QUEUES.find((q) => q.id === queue)?.label ?? 'current'} queue.
        Switch queue above, or run the scanner to add more.
      </div>
    </div>
  );

  return (
    <ReviewModeSurface
      controller={controller}
      title="Signal Triage"
      subtitle="Validate the broken-video heuristic. Keep = override as not broken; Flag = confirm bad."
      headerActions={headerActions}
      filtersContent={filtersContent}
      decisions={decisions}
      cardActions={cardActions}
      gestureSurfaceId="signal-triage"
      renderCardBadge={(asset) => {
        const score = readSignalScore(asset);
        return score === null ? null : (
          <div className="absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-0.5 font-mono text-xs text-amber-300">
            score {score}
          </div>
        );
      }}
      emptyState={emptyState}
      cardSize={cardSize}
      // Start on the Broken bucket (also clears any stale media_type/bucket flags).
      onMount={() => selectQueue('broken')}
    />
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
