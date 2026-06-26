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
import { createPortal } from 'react-dom';

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
import {
  SIGNAL_REF_PRESETS,
  signalRefTags,
  setSignalRefTag,
  customSignalRefTag,
} from '../lib/signalRefTag';
import type { AssetModel } from '../models/asset';
import { useSurfaceChromeSlot } from '../stores/surfaceChromeSlotStore';
import {
  useTriagePrefsStore,
  ROW_BATCH_MIN,
  ROW_BATCH_MAX,
  type TriageView,
  type ReviewedFilter,
} from '../stores/triagePrefsStore';

import { DynamicFilters } from './DynamicFilters';
import { ReviewModeSurface, type ReviewDecision } from './ReviewModeSurface';
import { GallerySurfaceShell } from './shared';
import { SignalCalibrationStrip } from './SignalCalibrationStrip';
import { SignalDetectionButton } from './SignalDetectionPopover';

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

/** Every signal registry-filter key the triage surface drives. Reset as a slate
 * on each queue/sub-filter switch (chosen = true, the rest = false) and cleared
 * on leave, so a stale flag can't fight the active scope. */
const SIGNAL_FILTER_KEYS = [
  'signal_likely_broken',
  'signal_borderline',
  'signal_overridden',
  'signal_override_clean',
  'signal_override_broken',
  'signal_likely_clean',
];

/** Registry filter keys the triage surface owns directly — hidden from the shared
 * DynamicFilters chip bar so they can't fight the queue scope: the bucket flags
 * are driven by {@link SignalBucketSwitcher} / {@link ReviewedFilterSwitcher}, and
 * media_type is force-pinned to `video` (signal scores only exist on videos). */
const TRIAGE_OWNED_FILTER_KEYS = [...SIGNAL_FILTER_KEYS, 'media_type'];

/**
 * The full filter slate for a queue + Reviewed sub-filter: every signal flag set
 * explicitly (chosen = true, rest = false) plus media_type pinned to video. Used
 * by both the apply call and the self-healing pinned-check so they can't drift.
 */
function computeQueueFilters(
  queue: TriageQueue,
  reviewed: ReviewedFilter,
): Record<string, boolean | 'video'> {
  const flags: Record<string, boolean | 'video'> = Object.fromEntries(
    SIGNAL_FILTER_KEYS.map((k) => [k, false]),
  );
  if (queue === 'broken') flags.signal_likely_broken = true;
  else if (queue === 'borderline') flags.signal_borderline = true;
  else if (reviewed === 'keep') flags.signal_override_clean = true;
  else if (reviewed === 'flag') flags.signal_override_broken = true;
  else flags.signal_overridden = true;
  flags.media_type = 'video';
  return flags;
}

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

/** All / Keep / Flag sub-filter for the Reviewed queue, styled like the bucket
 * switcher. The ✓/⚠ glyphs mirror the per-card decisions. */
function ReviewedFilterSwitcher({
  value,
  onSelect,
}: {
  value: ReviewedFilter;
  onSelect: (v: ReviewedFilter) => void;
}) {
  const options: { id: ReviewedFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'keep', label: '✓ Keep' },
    { id: 'flag', label: '⚠ Flag' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Show
      </span>
      <div className="flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              value === o.id
                ? 'bg-accent text-accent-text'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// View + row-batch types/bounds live in triagePrefsStore (persisted). The strip
// raises the global decoder cap (DEFAULT_MAX_ACTIVE = 3) to fit larger rows
// while mounted (each decoder ≈ 200–500MB native, so the ceiling stays modest).

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
      className="flex h-7 items-center overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700"
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
    <div className="flex h-7 items-center overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          className={`h-full px-2.5 text-xs font-medium transition-colors ${
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

/**
 * Per-card reference tagger: marks the clip as a broken-audio reference
 * (`signalref:<voice>`) that trains the fingerprint detector. Presets are quick
 * buttons for known voices; any custom `signalref:*` tag (added via the normal
 * tag box) shows as a chip too — the matcher unions all of them. Uses optimistic
 * per-tag state so taps reflect instantly and toggling one voice never blocks or
 * clobbers another; re-syncs from the asset when its server tags change.
 */
function SignalRefTagger({ asset }: { asset: AssetModel }) {
  const serverTags = signalRefTags(asset);
  // Optimistic active set + per-tag in-flight, so the buttons reflect taps
  // instantly and toggling one never blocks/clobbers another (multiple
  // signalref:* tags coexist). Re-sync from the asset when its server tags
  // change (the surfaces re-emit a fresh AssetModel on assetEvents updates).
  const serverKey = serverTags.slice().sort().join(',');
  const [active, setActive] = useState<string[]>(serverTags);
  const [busyTags, setBusyTags] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<string | null>(null); // null = input hidden
  useEffect(() => {
    setActive(signalRefTags(asset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const presetTags = new Set(SIGNAL_REF_PRESETS.map((p) => p.tag));
  const toggle = async (tag: string) => {
    const next = !active.includes(tag);
    setActive((prev) => (next ? [...prev, tag] : prev.filter((t) => t !== tag)));
    setBusyTags((prev) => new Set(prev).add(tag));
    try {
      await setSignalRefTag(asset.id, tag, next);
    } catch (e) {
      console.error('[signal-triage] ref tag failed', asset.id, tag, e);
      setActive((prev) => (next ? prev.filter((t) => t !== tag) : [...prev, tag])); // revert
    } finally {
      setBusyTags((prev) => {
        const n = new Set(prev);
        n.delete(tag);
        return n;
      });
    }
  };

  const commitDraft = () => {
    const tag = draft != null ? customSignalRefTag(draft) : null;
    setDraft(null);
    if (tag && !active.includes(tag)) void toggle(tag);
  };
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1"
      title="Tag as a broken-audio reference — trains the melody/pitch detector"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        ref
      </span>
      {SIGNAL_REF_PRESETS.map((p) => {
        const on = active.includes(p.tag);
        return (
          <button
            key={p.tag}
            type="button"
            disabled={busyTags.has(p.tag)}
            onClick={(e) => {
              e.stopPropagation();
              void toggle(p.tag);
            }}
            title={p.title}
            className={`rounded border px-1.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              on
                ? 'border-purple-500 bg-purple-600 text-white'
                : 'border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {p.glyph} {p.label}
          </button>
        );
      })}
      {active
        .filter((t) => !presetTags.has(t))
        .map((t) => (
          <button
            key={t}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void toggle(t);
            }}
            disabled={busyTags.has(t)}
            title={`Custom reference: ${t} — click to remove`}
            className="rounded bg-purple-600/80 px-1.5 py-0.5 text-[10px] text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {t.split(':').slice(1).join(':')}
          </button>
        ))}
      {draft == null ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft('');
          }}
          title="Add a custom voice label (e.g. weird-warble) — doubles as a short note"
          className="rounded border border-dashed border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          + label
        </button>
      ) : (
        <input
          autoFocus
          value={draft}
          placeholder="voice label…"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitDraft();
            else if (e.key === 'Escape') setDraft(null);
          }}
          onBlur={commitDraft}
          className="w-28 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
        />
      )}
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
  // View / row size / queue persist across reloads (triagePrefsStore).
  const view = useTriagePrefsStore((s) => s.view);
  const setView = useTriagePrefsStore((s) => s.setView);
  const rowSize = useTriagePrefsStore((s) => s.rowSize);
  const setRowSize = useTriagePrefsStore((s) => s.setRowSize);
  const queue = useTriagePrefsStore((s) => s.queue);
  const setQueue = useTriagePrefsStore((s) => s.setQueue);
  const reviewedFilter = useTriagePrefsStore((s) => s.reviewedFilter);
  const setReviewedFilter = useTriagePrefsStore((s) => s.setReviewedFilter);
  // Portal target in the top chrome strip (next to grid/masonry + size slider).
  const chromeSlotEl = useSurfaceChromeSlot((s) => s.el);
  // Bumped after each keep/flag to refetch the calibration strip so its grade +
  // label counts move as you label.
  const [labelTick, setLabelTick] = useState(0);
  // Row-mode batch cursor (front index of the visible strip), lifted here so the
  // pager can live in the pinned controls row instead of a separate strip row.
  const [cursor, setCursor] = useState(0);
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
    (q: TriageQueue, reviewed: ReviewedFilter) => {
      controller.replaceFilters(computeQueueFilters(q, reviewed));
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
    const expected = computeQueueFilters(queue, reviewedFilter);
    const pinned = Object.entries(expected).every(([k, v]) =>
      k === 'media_type' ? triageFilters[k] === v : Boolean(triageFilters[k]) === v,
    );
    if (!pinned) applyQueueFilters(queue, reviewedFilter);
  }, [queue, reviewedFilter, triageFilters, applyQueueFilters]);

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

  // ── Row-mode batch paging (lifted so the pager sits in the pinned header) ──
  const rowTotal = controller.assets.length;
  const rowRangeEnd = Math.min(cursor + rowSize, rowTotal);
  const nextBatch = useCallback(
    () => setCursor((c) => (c + rowSize >= rowTotal ? c : c + rowSize)),
    [rowSize, rowTotal],
  );
  const prevBatch = useCallback(() => setCursor((c) => Math.max(0, c - rowSize)), [rowSize]);

  // Reset to the front of the queue when the queue, sub-filter, or view changes.
  useEffect(() => {
    setCursor(0);
  }, [queue, reviewedFilter, view]);

  // Row-only: clamp the cursor when the queue shrinks under it (to-do Keep/Flag
  // removes cards), and keep a small look-ahead loaded so the strip never starves.
  useEffect(() => {
    if (view !== 'row') return;
    if (cursor > 0 && cursor >= rowTotal) setCursor(Math.max(0, rowTotal - rowSize));
  }, [view, cursor, rowTotal, rowSize]);
  useEffect(() => {
    if (view !== 'row') return;
    if (controller.hasMore && !controller.loading && cursor + rowSize * 2 >= rowTotal) {
      controller.loadMore();
    }
  }, [view, controller, cursor, rowTotal, rowSize]);

  // Queue segmented control + the same registry-driven chip bar the default
  // gallery uses (minus triage-owned keys), so the filter UX matches.
  //
  // No title/subtitle/header row: the surface name is already shown by the
  // gallery surface switcher above, and the verbose "Keep = …/Flag = …" copy is
  // compacted into the icon hints on the queue row (✓/⚠ mirror the card buttons).
  const filtersContent = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SignalBucketSwitcher queue={queue} onSelect={setQueue} />
          {queue === 'overridden' && (
            <ReviewedFilterSwitcher value={reviewedFilter} onSelect={setReviewedFilter} />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
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

  // View controls (Grid/Row + row stepper + batch pager) live in the top chrome
  // strip next to grid/masonry + size, via a portal — so navigation sits with the
  // other "how am I viewing" controls instead of inside the filter block. Falls
  // back to rendering inline above the body if the slot isn't mounted yet.
  const viewControls = (
    <div className="flex flex-wrap items-center gap-2">
      {view === 'row' && (
        <>
          <RowSizeStepper size={rowSize} onChange={setRowSize} />
          <BatchPager
            rangeStart={rowTotal === 0 ? 0 : cursor + 1}
            rangeEnd={rowRangeEnd}
            total={rowTotal}
            hasMore={controller.hasMore}
            onPrev={prevBatch}
            onNext={nextBatch}
            prevDisabled={cursor <= 0}
            nextDisabled={rowRangeEnd >= rowTotal && !controller.hasMore}
          />
        </>
      )}
      <ViewModeSwitcher view={view} onSelect={setView} />
    </div>
  );

  // Row mode: a focused strip of a few clips that play together on hover, for
  // eyeballing several at a time instead of scanning a whole page. Reuses the
  // same shell/filters/empty state as the grid so only the body differs.
  const body =
    view === 'row' ? (
      <GallerySurfaceShell
        title=""
        filtersContent={filtersContent}
        error={controller.error}
        loading={controller.loading}
        itemCount={controller.assets.length}
        emptyState={emptyState}
        pinHeader
      >
        <TriageRowStrip
          controller={controller}
          decisions={decisions}
          cardActions={cardActions}
          cardSize={cardSize}
          rowSize={rowSize}
          cursor={cursor}
          onNext={nextBatch}
          onPrev={prevBatch}
        />
      </GallerySurfaceShell>
    ) : (
      <ReviewModeSurface
        controller={controller}
        // Empty title → no header row (name is in the surface switcher above).
        title=""
        filtersContent={filtersContent}
        decisions={decisions}
        cardActions={cardActions}
        cardFooter={(asset) => (
          <>
            <SignalRefTagger asset={asset} />
            <SignalDetectionButton asset={asset} />
          </>
        )}
        gestureSurfaceId="signal-triage"
        cardWidgets={buildSignalScoreWidgets}
        emptyState={emptyState}
        cardSize={cardSize}
        pinHeader
        // Initial queue ('broken') + any drift is pinned by the self-healing effect
        // above — no one-shot onMount (it raced the controller's first fetch).
      />
    );

  return (
    <>
      {chromeSlotEl ? (
        createPortal(viewControls, chromeSlotEl)
      ) : (
        <div className="px-6 pt-3">{viewControls}</div>
      )}
      {body}
    </>
  );
}

/** Compact ◂ N–M of T ▸ pager for the pinned controls row (row mode). */
function BatchPager({
  rangeStart,
  rangeEnd,
  total,
  hasMore,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  hasMore?: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
}) {
  const btn =
    'h-full px-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-neutral-300 dark:hover:bg-neutral-800';
  return (
    <div className="flex h-7 items-center overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
      <button type="button" className={btn} onClick={onPrev} disabled={prevDisabled} title="Previous batch (←)">
        ◂
      </button>
      <span className="min-w-[5rem] px-1 text-center tabular-nums">
        {total === 0 ? '0' : `${rangeStart}–${rangeEnd}`} of {total}
        {hasMore ? '+' : ''}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={nextDisabled} title="Next batch (→)">
        ▸
      </button>
    </div>
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
  cursor,
  onNext,
  onPrev,
}: {
  controller: AssetsController;
  decisions: ReviewDecision[];
  cardActions: (asset: AssetModel) => Partial<MediaCardActions>;
  cardSize: number;
  rowSize: number;
  /** Front index of the visible batch (paging lives in the pinned header). */
  cursor: number;
  onNext: () => void;
  onPrev: () => void;
}) {
  const assets = controller.assets;
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

  const windowAssets = assets.slice(cursor, cursor + rowSize);

  // Apply a decision to EVERY clip currently in the row — the throughput point of
  // row mode. In the to-do queues this clears the batch and the next slides in.
  const actAll = useCallback(
    (run: ReviewDecision['run']) => {
      for (const a of windowAssets) void run(a);
    },
    [windowAssets],
  );

  // Hotkeys: ←/→ page the batch (paging owned by the parent); a decision key
  // (K/F) acts on the hovered card (fallback to the first); Shift+key applies it
  // to the whole row. Bare keys require shift NOT held (see useKeyboardShortcuts),
  // so the two never collide.
  useKeyboardShortcuts(
    useMemo(() => {
      const actOne = (run: ReviewDecision['run']) => {
        const target = windowAssets.find((a) => a.id === hoveredId) ?? windowAssets[0];
        if (target) void run(target);
      };
      return [
        { key: 'ArrowRight', description: 'Next batch', callback: onNext },
        { key: 'ArrowLeft', description: 'Previous batch', callback: onPrev },
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
    }, [decisions, windowAssets, hoveredId, onNext, onPrev, actAll]),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk actions — decide the whole visible row in one click. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
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
        <span className="text-neutral-400 dark:text-neutral-500">· hover the row to play all</span>
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
            <div className="border-t border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex gap-2">
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
              <SignalRefTagger asset={asset} />
              <SignalDetectionButton asset={asset} />
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
