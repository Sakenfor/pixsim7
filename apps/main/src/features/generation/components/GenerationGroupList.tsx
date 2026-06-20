/**
 * Generation group list.
 *
 * The grouped, action-bearing body shared by the activity-bar flyout and the
 * inline-expandable pause toast. Given a flat list of generations it groups
 * them (by prompt/asset/etc.), shows a per-group count badge + refiltering
 * hint, and renders group-level Pause / Cancel / Resume / Retry actions via
 * `useBatchGenerationActions`.
 *
 * Pure presentation over whatever `generations` it's handed — callers decide
 * the scope (all active, all paused, or one toast's exact id set).
 */
import { useToast } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import { useAsset, getAssetDisplayUrls } from '@features/assets';

import { useMediaThumbnailFull } from '@/hooks/useMediaThumbnail';

import { useBatchGenerationActions, type BatchActionKind } from '../hooks/useBatchGenerationActions';
import { groupGenerations, type GenerationGroupBy } from '../lib/generationGrouping';
import { isActiveStatus, resolveGranularStatus, type GenerationModel } from '../models';

export type GenerationGroupTone = 'active' | 'paused' | 'warning';

/** Count-badge word shown next to the per-group count. */
const TONE_LABEL: Record<GenerationGroupTone, string> = {
  active: 'active',
  paused: 'paused',
  warning: 'flagged',
};

interface GenerationGroupListProps {
  generations: GenerationModel[];
  groupBy: GenerationGroupBy;
  /** Drives the count-badge label + colour. */
  tone: GenerationGroupTone;
  /** Shown when there are no groups to display. */
  emptyLabel?: string;
  /** Cap the number of groups rendered. Defaults to 20. */
  maxGroups?: number;
  /** Optional wrapper className for the scroll container. */
  className?: string;
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
 *  GroupAssetPreview, sized for the compact surface). */
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

export function GenerationGroupList({
  generations,
  groupBy,
  tone,
  emptyLabel = 'No generations',
  maxGroups = 20,
  className,
}: GenerationGroupListProps) {
  const toast = useToast();
  const { runBatch, isRunning } = useBatchGenerationActions();

  const groups = useMemo(
    () => (groupGenerations(generations, [groupBy]) ?? []).slice(0, maxGroups),
    [generations, groupBy, maxGroups],
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

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-neutral-500">
        {emptyLabel}
      </div>
    );
  }

  const badgeTone =
    tone === 'active' ? 'bg-blue-900/40 text-blue-300' : 'bg-amber-900/40 text-amber-300';

  return (
    <div className={className ?? 'divide-y divide-neutral-800/50'}>
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
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${badgeTone}`}
                >
                  {grp.items.length} {TONE_LABEL[tone]}
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
  );
}
