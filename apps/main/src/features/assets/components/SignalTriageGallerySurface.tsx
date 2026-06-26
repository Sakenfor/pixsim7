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

import { Button } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAsset, setSignalOverride } from '@lib/api/assets';
import { createBindingFromValue } from '@lib/editing-core';
import { getVideoActivationPoolStats, setVideoActivationCap } from '@lib/media/videoActivationPool';
import {
  createBadgeWidget,
  BADGE_SLOT,
  BADGE_PRIORITY,
  type OverlayWidget,
} from '@lib/ui/overlay';

import { MediaCard, type MediaCardActions } from '@/components/media/MediaCard';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import type { AssetsController } from '../hooks/useAssetsController';
import { assetEvents } from '../lib/assetEvents';
import { toggleFavoriteTag } from '../lib/favoriteTag';
import type { AssetModel } from '../models/asset';

import { DynamicFilters } from './DynamicFilters';
import { ReviewModeSurface, type ReviewDecision } from './ReviewModeSurface';
import { GallerySurfaceShell } from './shared';
import { SignalCalibrationStrip } from './SignalCalibrationStrip';

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
  { id: 'overridden', label: 'Reviewed', filter: 'signal_overridden' },
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

/** Whether triage shows the full virtualized grid or the focused row strip. */
type TriageView = 'grid' | 'row';

/** Row-strip batch size: how many clips play at once. Default 3 matches the
 * global decoder-pool cap (DEFAULT_MAX_ACTIVE = 3) so the whole hovered row can
 * decode without preempting each other; above that the strip raises the cap
 * while mounted (each decoder ≈ 200–500MB native, so the ceiling stays modest). */
const ROW_BATCH_DEFAULT = 3;
const ROW_BATCH_MIN = 1;
const ROW_BATCH_MAX = 6;

/** Compact −/N/+ stepper for the row batch size. */
function RowSizeStepper({
  size,
  onChange,
}: {
  size: number;
  onChange: (n: number) => void;
}) {
  const btn =
    'px-1.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800';
  return (
    <div
      className="flex items-center overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700"
      title="Clips per row"
    >
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(ROW_BATCH_MIN, size - 1))}
        disabled={size <= ROW_BATCH_MIN}
        aria-label="Fewer per row"
      >
        −
      </button>
      <span className="min-w-[2.5rem] px-1 text-center text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
        {size}/row
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(ROW_BATCH_MAX, size + 1))}
        disabled={size >= ROW_BATCH_MAX}
        aria-label="More per row"
      >
        +
      </button>
    </div>
  );
}

/** Grid ⇄ Row segmented toggle, styled like {@link SignalBucketSwitcher}. */
function ViewModeSwitcher({
  view,
  onSelect,
}: {
  view: TriageView;
  onSelect: (v: TriageView) => void;
}) {
  const options: { id: TriageView; label: string }[] = [
    { id: 'grid', label: 'Grid' },
    { id: 'row', label: 'Row' },
  ];
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            view === o.id
              ? 'bg-accent text-accent-text'
              : 'bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Compact, icon-first replacement for the old "K = Keep · F = Flag · swipe ↑↓"
 * help line. The ✓/⚠ glyphs mirror the per-card decision buttons; full wording
 * lives in the tooltip so the row stays short. */
function TriageHints() {
  const kbd =
    'rounded border border-neutral-300 px-1 font-mono text-[10px] leading-tight text-neutral-500 dark:border-neutral-600 dark:text-neutral-400';
  return (
    <span
      className="flex items-center gap-1.5"
      title="K = Keep (mark not broken) · F = Flag (confirm broken) · swipe ↑ Keep / ↓ Flag"
    >
      <kbd className={kbd}>K</kbd>
      <span className="text-emerald-500">✓</span>
      <kbd className={kbd}>F</kbd>
      <span className="text-amber-500">⚠</span>
      <span className="text-neutral-400 dark:text-neutral-500">↑↓</span>
    </span>
  );
}

export function SignalTriageContent({ controller, cardSize }: SignalTriageContentProps) {
  const [queue, setQueue] = useState<TriageQueue>('broken');
  const [view, setView] = useState<TriageView>('grid');
  const [rowSize, setRowSize] = useState(ROW_BATCH_DEFAULT);
  // Bumped after each keep/flag to refetch the calibration strip so its grade +
  // label counts move as you label.
  const [labelTick, setLabelTick] = useState(0);
  // Last keep/flag, so a mis-click is one keystroke to undo. Holds the asset and
  // its PRIOR override (usually null in the to-do queues) to restore.
  const [lastAction, setLastAction] = useState<
    { assetId: number; prev: 'clean' | 'broken' | null } | null
  >(null);

  // On leaving triage, clear the filters it forced (media_type=video + bucket
  // flags) from the shared `assets_filters` session/URL so they don't leak into
  // the default gallery. Runs only on unmount; reads the latest controller via ref
  // (the controller object identity changes every render).
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  useEffect(() => {
    return () => {
      controllerRef.current.setFilters(
        Object.fromEntries(TRIAGE_OWNED_FILTER_KEYS.map((k) => [k, undefined])),
      );
    };
  }, []);

  // Pin the controller's filters to the active queue.
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
  const applyQueueFilters = useCallback(
    (q: TriageQueue) => {
      const flags = Object.fromEntries(TRIAGE_QUEUES.map((x) => [x.filter, x.id === q]));
      controller.replaceFilters({ ...flags, media_type: 'video' });
    },
    [controller],
  );

  // Keep the controller pinned to the active queue — declaratively, not as a
  // one-shot on mount. A one-shot `onMount` raced the controller's first fetch
  // (and the brief window where the default generic gallery renders before this
  // surface's async registration lands), so on a hard refresh un-flagged assets
  // leaked in and stuck until you manually clicked a bucket. This re-asserts the
  // bucket whenever the live filters drift away from it (refresh race, stray
  // reset, default-gallery filters bleeding through). Idempotent: when the
  // filters already match we skip the write, so `replaceFilters` → filters-change
  // → effect can't loop. Note we compare only the keys this surface owns, so a
  // tag/search the user adds via the chip bar (which keeps media_type=video and
  // the bucket intact) is preserved and does NOT trigger a heal.
  const triageFilters = controller.filters as Record<string, unknown>;
  useEffect(() => {
    const pinned =
      triageFilters.media_type === 'video' &&
      TRIAGE_QUEUES.every((x) => Boolean(triageFilters[x.filter]) === (x.id === queue));
    if (!pinned) applyQueueFilters(queue);
  }, [queue, triageFilters, applyQueueFilters]);

  const triage = useCallback(
    async (assetId: number, decision: 'clean' | 'broken') => {
      // Capture the prior override (before the write) so Undo can restore it.
      const prev = controller.assets.find((a) => a.id === assetId)?.signalOverride ?? null;
      try {
        await setSignalOverride(assetId, decision);
        // Broken/Borderline are to-do queues — acting resolves the item, so drop
        // it from view. In Reviewed the asset stays reviewed (the override just
        // flips clean<->broken), so keep it in place rather than making it vanish.
        if (queue !== 'overridden') {
          controller.removeAsset?.(assetId);
        } else {
          // Reviewed: keep the card, but refresh its model so the active-decision
          // highlight (and any card state) reflects the new clean/broken choice.
          try {
            const refreshed = await getAsset(assetId);
            assetEvents.emitAssetUpdated(refreshed);
          } catch {
            // Best effort — the highlight just won't flip until the list reloads.
          }
        }
        setLastAction({ assetId, prev });
        setLabelTick((n) => n + 1);
      } catch (e) {
        console.error('[signal-triage] override failed', assetId, decision, e);
      }
    },
    [controller, queue],
  );

  // Revert the last keep/flag: restore the prior override (null clears it) and
  // refetch the bucket so a dropped card slides back in.
  const undoLast = useCallback(async () => {
    if (!lastAction) return;
    const { assetId, prev } = lastAction;
    setLastAction(null);
    try {
      await setSignalOverride(assetId, prev);
      controller.reset();
      setLabelTick((n) => n + 1);
    } catch (e) {
      console.error('[signal-triage] undo failed', assetId, e);
    }
  }, [lastAction, controller]);

  // The captured undo target is bucket-specific; drop it when the queue changes.
  useEffect(() => {
    setLastAction(null);
  }, [queue]);

  useKeyboardShortcuts([
    { key: 'u', description: 'Undo last keep/flag', callback: () => void undoLast() },
  ]);

  const decisions = useMemo<ReviewDecision[]>(
    () => [
      {
        id: 'keep',
        label: '✓ Keep',
        hotkey: 'k',
        hotkeyLabel: 'K',
        advance: 'stay',
        run: (asset) => triage(asset.id, 'clean'),
        // Highlight the current decision (visible mainly in Reviewed, where the
        // card stays after deciding).
        isActive: (asset) => readUserOverride(asset) === 'clean',
      },
      {
        id: 'flag',
        label: '⚠ Flag',
        hotkey: 'f',
        hotkeyLabel: 'F',
        advance: 'stay',
        run: (asset) => triage(asset.id, 'broken'),
        isActive: (asset) => readUserOverride(asset) === 'broken',
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

  // Queue segmented control + the same registry-driven chip bar the default
  // gallery uses (minus triage-owned keys), so the filter UX matches.
  //
  // No title/subtitle/header row: the surface name is already shown by the
  // gallery surface switcher above, and the verbose "Keep = …/Flag = …" copy is
  // compacted into the icon hints on the queue row (✓/⚠ mirror the card buttons).
  const filtersContent = (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SignalBucketSwitcher queue={queue} onSelect={setQueue} />
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="tabular-nums">
            {controller.assets.length}
            {controller.hasMore ? '+' : ''} left
          </span>
          <TriageHints />
          {lastAction && (
            <button
              type="button"
              onClick={() => void undoLast()}
              title="Undo last keep/flag (U)"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              ↶ Undo
            </button>
          )}
          {view === 'row' && <RowSizeStepper size={rowSize} onChange={setRowSize} />}
          <ViewModeSwitcher view={view} onSelect={setView} />
        </div>
      </div>
      <SignalCalibrationStrip refreshKey={labelTick} />
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

  // Row mode: a focused strip of a few clips that play together on hover, for
  // eyeballing several at a time instead of scanning a whole page. Reuses the
  // same shell/filters/empty state as the grid so only the body differs.
  if (view === 'row') {
    return (
      <GallerySurfaceShell
        title=""
        filtersContent={filtersContent}
        error={controller.error}
        loading={controller.loading}
        itemCount={controller.assets.length}
        emptyState={emptyState}
      >
        <TriageRowStrip
          controller={controller}
          decisions={decisions}
          cardActions={cardActions}
          cardSize={cardSize}
          rowSize={rowSize}
        />
      </GallerySurfaceShell>
    );
  }

  return (
    <ReviewModeSurface
      controller={controller}
      // Empty title → no header row (name is in the surface switcher above).
      title=""
      filtersContent={filtersContent}
      decisions={decisions}
      cardActions={cardActions}
      gestureSurfaceId="signal-triage"
      cardWidgets={buildSignalScoreWidgets}
      emptyState={emptyState}
      cardSize={cardSize}
      // Initial queue ('broken') + any drift is pinned by the self-healing effect
      // above — no one-shot onMount (it raced the controller's first fetch).
    />
  );
}

/**
 * Focused row-strip triage: shows `rowSize` clips at a time; hovering anywhere
 * in the row force-plays the WHOLE row at once (the decoder cap is raised to fit
 * while mounted), so you can compare a few clips without scanning a page. Decide
 * per card (buttons) or via K/F on the hovered card; Shift+K/Shift+F (or the
 * "… all" buttons) apply to the whole row — the throughput point of the mode.
 * ◂/▸ (or ←/→) page the batch; in the to-do queues acting removes clips and the
 * next batch slides in; the queue auto-tops-up as you near the end.
 */
function TriageRowStrip({
  controller,
  decisions,
  cardActions,
  cardSize,
  rowSize,
}: {
  controller: AssetsController;
  decisions: ReviewDecision[];
  cardActions: (asset: AssetModel) => Partial<MediaCardActions>;
  cardSize: number;
  rowSize: number;
}) {
  const assets = controller.assets;
  const total = assets.length;
  const [cursor, setCursor] = useState(0);
  const [rowHovered, setRowHovered] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Raise the global video-decoder cap to fit the whole row while this strip is
  // mounted, restoring it on unmount / size change. Default cap is 3, so a row
  // of ≤3 is a no-op. We capture the LIVE cap (not a hardcoded default) so we
  // restore whatever was there; React runs the prior effect's cleanup before the
  // next, so the captured value never includes our own bump.
  useEffect(() => {
    const original = getVideoActivationPoolStats().maxActive;
    if (rowSize > original) setVideoActivationCap(rowSize);
    return () => setVideoActivationCap(original);
  }, [rowSize]);

  // Clamp the cursor back into range when the queue shrinks under it (Keep/Flag
  // removes from the to-do queues, so the front slides up beneath a held cursor).
  useEffect(() => {
    if (cursor > 0 && cursor >= total) {
      setCursor(Math.max(0, total - rowSize));
    }
  }, [total, cursor, rowSize]);

  // Keep a small look-ahead loaded so the strip never starves mid-pass.
  useEffect(() => {
    if (controller.hasMore && !controller.loading && cursor + rowSize * 2 >= total) {
      controller.loadMore();
    }
  }, [controller, total, cursor, rowSize]);

  const windowAssets = assets.slice(cursor, cursor + rowSize);

  const next = useCallback(
    () => setCursor((c) => (c + rowSize >= total ? c : c + rowSize)),
    [total, rowSize],
  );
  const prev = useCallback(() => setCursor((c) => Math.max(0, c - rowSize)), [rowSize]);

  // Apply a decision to EVERY clip currently in the row — the throughput point of
  // row mode. In the to-do queues this clears the batch and the next slides in.
  const actAll = useCallback(
    (run: ReviewDecision['run']) => {
      for (const a of windowAssets) void run(a);
    },
    [windowAssets],
  );

  // Hotkeys: ←/→ page the batch; a decision key (K/F) acts on the hovered card
  // (fallback to the first); Shift+key applies it to the whole row. Bare keys
  // require shift NOT held (see useKeyboardShortcuts), so the two never collide.
  useKeyboardShortcuts(
    useMemo(() => {
      const actOne = (run: ReviewDecision['run']) => {
        const target = windowAssets.find((a) => a.id === hoveredId) ?? windowAssets[0];
        if (target) void run(target);
      };
      return [
        { key: 'ArrowRight', description: 'Next batch', callback: next },
        { key: 'ArrowLeft', description: 'Previous batch', callback: prev },
        ...decisions.flatMap((d) => [
          { key: d.hotkey, description: d.label, callback: () => actOne(d.run) },
          {
            key: d.hotkey,
            shift: true,
            description: `${d.label} — whole row`,
            callback: () => actAll(d.run),
          },
        ]),
      ];
    }, [decisions, windowAssets, hoveredId, next, prev, actAll]),
  );

  const rangeEnd = Math.min(cursor + rowSize, total);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <Button variant="secondary" className="text-xs" onClick={prev} disabled={cursor <= 0}>
          ◂ Prev
        </Button>
        <span className="tabular-nums">
          {total === 0 ? '0' : `${cursor + 1}–${rangeEnd}`} of {total}
          {controller.hasMore ? '+' : ''} · hover the row to play all
        </span>
        <Button
          variant="secondary"
          className="text-xs"
          onClick={next}
          disabled={rangeEnd >= total && !controller.hasMore}
        >
          Next ▸
        </Button>
      </div>

      {/* Bulk actions — decide the whole visible row in one click. */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">
          Whole row ({windowAssets.length}):
        </span>
        {decisions.map((d) => (
          <Button
            key={d.id}
            variant="secondary"
            className="text-xs"
            onClick={() => actAll(d.run)}
            disabled={windowAssets.length === 0}
            title={`${d.label} every clip in the row (Shift+${d.hotkeyLabel ?? d.hotkey.toUpperCase()})`}
          >
            {d.label} all
          </Button>
        ))}
      </div>

      <div
        className="flex flex-wrap justify-center gap-4"
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => {
          setRowHovered(false);
          setHoveredId(null);
        }}
      >
        {windowAssets.map((asset) => (
          <div
            key={asset.id}
            className={`flex flex-col overflow-hidden rounded-lg border-2 transition-colors ${
              hoveredId === asset.id
                ? 'border-blue-400 dark:border-blue-500'
                : 'border-neutral-200 dark:border-neutral-700'
            }`}
            style={{ width: cardSize }}
            onMouseEnter={() => setHoveredId(asset.id)}
          >
            <MediaCard
              asset={asset}
              forcePlay={rowHovered}
              onToggleFavorite={() => toggleFavoriteTag(asset)}
              actions={{
                ...controller.getAssetActions(asset),
                ...cardActions(asset),
              }}
              customWidgets={buildSignalScoreWidgets(asset)}
              gestureSurfaceId="signal-triage"
            />
            <div className="flex gap-2 border-t border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
              {decisions.map((d) => {
                const active = d.isActive?.(asset) ?? false;
                return (
                  <Button
                    key={d.id}
                    variant={active ? 'primary' : d.variant ?? 'secondary'}
                    className="flex-1 text-sm"
                    onClick={() => void d.run(asset)}
                  >
                    {d.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pull the user's manual keep/flag decision from the asset, if any. */
function readUserOverride(asset: AssetModel): 'clean' | 'broken' | null {
  return asset.signalOverride ?? null;
}

/** The heuristic score for the per-card badge (mirror of signal_metrics.score). */
function readSignalScore(asset: AssetModel): number | null {
  return typeof asset.signalScore === 'number' ? asset.signalScore : null;
}

/**
 * Per-card heuristic-score badge as a canonical overlay widget (top-left stack
 * group) rather than a hand-rolled absolute div — so it auto-stacks with the
 * card's other badges via box-separation instead of overlapping them. The
 * severity/verdict already lives in the bottom-left ring cluster
 * (getAssetWarnings); this is just the raw number, so it's a passive gray chip.
 */
function buildSignalScoreWidgets(asset: AssetModel): OverlayWidget[] {
  const score = readSignalScore(asset);
  if (score === null) return [];
  return [
    createBadgeWidget({
      id: 'signal-score',
      ...BADGE_SLOT.topLeft,
      variant: 'text',
      labelBinding: createBindingFromValue('label', `score ${score}`),
      color: 'gray',
      priority: BADGE_PRIORITY.info,
      tooltip: 'Broken-video heuristic score (higher = more suspect)',
      className: 'font-mono tabular-nums',
    }),
  ];
}
