/**
 * Generation Activity Flyout
 *
 * Compact panel content for the ActivityBar generations widget. Shows
 * in-flight generations grouped by prompt (or asset) with group-level
 * Pause / Cancel / Resume / Retry actions — a lightweight subset of the full
 * GenerationsPanel for quick triage without opening the panel.
 *
 * Pure content component (positioning + portal are owned by the widget,
 * mirroring NotificationActivityBarWidget). Click-to-open, consistent with
 * the notifications bell.
 */
import { useToast } from '@pixsim7/shared.ui';
import { useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { useAsset, getAssetDisplayUrls } from '@features/assets';


import { useMediaThumbnailFull } from '@/hooks/useMediaThumbnail';

import { useBatchGenerationActions, type BatchActionKind } from '../hooks/useBatchGenerationActions';
import { groupGenerations, type GenerationGroupBy } from '../lib/generationGrouping';
import { isActiveStatus, resolveGranularStatus, type GenerationModel } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

interface GenerationActivityFlyoutProps {
  groupBy: GenerationGroupBy;
  onChangeGroupBy: (next: GenerationGroupBy) => void;
  onOpenFullPanel: () => void;
  onClose: () => void;
  isConnected: boolean;
  onReconnect: () => void;
}

function pausableIds(items: GenerationModel[]): number[] {
  return items
    .filter((g) => g.status === 'pending' || (g.status === 'processing' && !g.deferredAction))
    .map((g) => g.id);
}
function cancellableIds(items: GenerationModel[]): number[] {
  return items.filter((g) => isActiveStatus(g.status) && g.deferredAction !== 'cancel').map((g) => g.id);
}
function resumableIds(items: GenerationModel[]): number[] {
  return items.filter((g) => g.status === 'paused').map((g) => g.id);
}
function retryableIds(items: GenerationModel[]): number[] {
  return items.filter((g) => g.status === 'failed' || g.status === 'cancelled').map((g) => g.id);
}

/** Small asset thumbnail for asset-grouped rows (mirrors GenerationsPanel's
 *  GroupAssetPreview, sized for the compact flyout). */
function GroupAssetThumb({ assetId }: { assetId: number }) {
  const { asset, loading } = useAsset(assetId);
  const urls = asset ? getAssetDisplayUrls(asset) : undefined;
  const { src: thumbSrc, loading: thumbLoading } = useMediaThumbnailFull(
    urls?.thumbnailUrl,
    urls?.previewUrl,
  );

  if (!loading && !asset) return null;
  if (loading || thumbLoading) {
    return <div className="w-9 h-9 rounded bg-neutral-700 animate-pulse-subtle flex-shrink-0" />;
  }
  if (!thumbSrc) return null;
  return <img src={thumbSrc} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />;
}

const ACTION_LABEL: Record<BatchActionKind, string> = {
  pause: 'Pause',
  cancel: 'Cancel',
  resume: 'Resume',
  retry: 'Retry',
};

export function GenerationActivityFlyout({
  groupBy,
  onChangeGroupBy,
  onOpenFullPanel,
  onClose,
  isConnected,
  onReconnect,
}: GenerationActivityFlyoutProps) {
  const toast = useToast();
  const { runBatch, isRunning } = useBatchGenerationActions();
  const generations = useGenerationsStore((s) => s.generations);
  const [countMode, setCountMode] = useState<'active' | 'paused'>('active');
  const allGenerations = useMemo(() => Array.from(generations.values()), [generations]);

  const totalActive = useMemo(() => {
    let count = 0;
    for (const g of allGenerations) {
      if (isActiveStatus(g.status)) count++;
    }
    return count;
  }, [allGenerations]);
  const pausedCount = useMemo(() => {
    let count = 0;
    for (const g of allGenerations) {
      if (g.status === 'paused') count++;
    }
    return count;
  }, [allGenerations]);
  const headerCount = countMode === 'active' ? totalActive : pausedCount;
  const headerLabel = countMode === 'active' ? 'active' : 'paused';
  const visibleGenerations = useMemo(
    () =>
      allGenerations.filter((g) =>
        countMode === 'active' ? isActiveStatus(g.status) : g.status === 'paused',
      ),
    [allGenerations, countMode],
  );
  const groups = useMemo(
    () => (groupGenerations(visibleGenerations, [groupBy]) ?? []).slice(0, 20),
    [visibleGenerations, groupBy],
  );

  async function handleGroupAction(kind: BatchActionKind, ids: number[]) {
    if (ids.length === 0) return;
    const result = await runBatch(kind, ids);
    if (result.failed > 0) {
      toast.error(`${ACTION_LABEL[kind]}: ${result.succeeded} ok, ${result.failed} failed`);
    } else if (result.reconciled > 0) {
      // Some rows had already moved on (stale snapshot) — reconciled, not failed.
      const acted = result.succeeded - result.reconciled;
      toast.success(
        `${ACTION_LABEL[kind]} ${acted} generation(s) · ${result.reconciled} already updated`,
      );
    } else {
      toast.success(`${ACTION_LABEL[kind]} ${result.succeeded} generation(s)`);
    }
  }

  return (
    <div className="w-[380px] h-[440px] max-h-[80vh] flex flex-col bg-neutral-900/95 border border-neutral-700/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-700/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">Generation activity</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCountMode((prev) => (prev === 'active' ? 'paused' : 'active'))}
            className={`px-1.5 h-4 inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none whitespace-nowrap transition-colors ${
              countMode === 'active'
                ? 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
                : 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
            }`}
            title={`Showing ${headerLabel} count. Click to toggle active/paused.`}
            aria-label={`Showing ${headerLabel} count. Click to toggle active or paused count.`}
          >
            {headerCount} {headerLabel}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded bg-neutral-800 p-0.5 text-[10px]">
            {(['prompt', 'asset'] as const).map((dim) => (
              <button
                key={dim}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChangeGroupBy(dim)}
                className={`px-1.5 py-0.5 rounded capitalize transition-colors ${
                  groupBy === dim
                    ? 'bg-neutral-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {dim}
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenFullPanel}
            className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
            title="Open the full generations panel"
          >
            Open panel
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-0.5 rounded hover:bg-neutral-700/50 transition-colors"
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-neutral-500">
            {countMode === 'active' ? 'No active generations' : 'No paused generations'}
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/50">
            {groups.map((grp) => {
              const pause = pausableIds(grp.items);
              const cancel = cancellableIds(grp.items);
              const resume = resumableIds(grp.items);
              const retry = retryableIds(grp.items);
              // How many items in this prompt/asset group are bouncing through
              // render-moderation (fast-filter) retries — the at-a-glance signal
              // for "this prompt keeps getting filtered".
              const refilteringCount = grp.items.reduce(
                (n, g) => (resolveGranularStatus(g) === 'refiltering' ? n + 1 : n),
                0,
              );
              return (
                <div key={grp.key} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-start gap-2 min-w-0">
                      {grp.dimension === 'asset' && grp.key !== '__no_asset__' && (
                        <GroupAssetThumb assetId={Number(grp.key)} />
                      )}
                      <span className="text-xs text-neutral-300 line-clamp-2 break-words">
                        {grp.label}
                      </span>
                    </span>
                    <span className="flex-shrink-0 flex items-center gap-1">
                      {refilteringCount > 0 && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap bg-orange-900/50 text-orange-300"
                          title={`${refilteringCount} attempt(s) here keep hitting render-time moderation (fast-filtered) and are auto-retrying.`}
                        >
                          ⟳ {refilteringCount} filtered
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          countMode === 'active'
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-amber-900/40 text-amber-300'
                        }`}
                      >
                        {grp.items.length} {headerLabel}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {([
                      ['pause', pause],
                      ['cancel', cancel],
                      ['resume', resume],
                      ['retry', retry],
                    ] as Array<[BatchActionKind, number[]]>).map(([kind, ids]) =>
                      ids.length > 0 ? (
                        <button
                          key={kind}
                          type="button"
                          disabled={isRunning}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleGroupAction(kind, ids)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            kind === 'cancel'
                              ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                              : kind === 'pause'
                                ? 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
                                : 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600'
                          }`}
                          title={`${ACTION_LABEL[kind]} ${ids.length} generation(s) in this group`}
                        >
                          {ACTION_LABEL[kind]} ({ids.length})
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connection footer — only when degraded. */}
      {!isConnected && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-neutral-700/40 bg-red-950/30 text-[10px]">
          <span className="flex items-center gap-1.5 text-red-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Disconnected
          </span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onReconnect}
            className="px-1.5 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}
    </div>
  );
}
