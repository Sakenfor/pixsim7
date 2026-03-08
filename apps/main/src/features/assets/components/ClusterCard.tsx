import { useCallback, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import type { AssetCluster } from '../lib/clusterHelpers';

import { GroupPreviewCell } from './GroupCards';
import { formatRelativeTime } from './groupHelpers';

export interface ClusterCardProps {
  cluster: AssetCluster;
  cardSize: number;
  /** Render a full MediaCard for an asset inside the expanded cluster */
  renderAssetCard: (assetId: number) => React.ReactNode;
}

/**
 * A compact card representing a cluster of related assets.
 * When collapsed, shows a stacked preview with a count badge.
 * When expanded, reveals all assets inline as regular cards.
 */
export function ClusterCard({ cluster, cardSize, renderAssetCard }: ClusterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  const previewAssets = useMemo(
    () => cluster.assets.slice(0, 4),
    [cluster.assets],
  );

  const latestTimestamp = useMemo(() => {
    let max = 0;
    for (const a of cluster.assets) {
      const ts = Date.parse(a.createdAt);
      if (ts > max) max = ts;
    }
    return max;
  }, [cluster.assets]);

  if (expanded) {
    return (
      <div className="col-span-full rounded-xl border border-accent/20 dark:border-accent/15 bg-accent/[0.03] dark:bg-accent/[0.04] p-3 border-l-[3px] border-l-accent/50">
        {/* Cluster header bar */}
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center gap-2 px-3 py-1.5 mb-3 rounded-lg bg-white/70 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 hover:border-accent-muted transition-colors text-left"
        >
          <Icon name="chevronDown" size={12} className="text-accent" />
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate flex-1">
            {cluster.label}
          </span>
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums">
            {cluster.assets.length} items
          </span>
        </button>
        {/* Expanded asset grid */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
            gap: '12px',
          }}
        >
          {cluster.assets.map((a) => renderAssetCard(a.id))}
        </div>
      </div>
    );
  }

  // Collapsed: compact stacked preview card
  return (
    <button
      type="button"
      onClick={toggle}
      className="relative w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-accent-muted transition-colors overflow-hidden text-left group/cluster"
    >
      {/* Stacked shadow layers behind the card */}
      <div className="absolute inset-x-1 -top-1 h-2 rounded-t-lg bg-neutral-300/40 dark:bg-neutral-600/30 -z-10" />
      <div className="absolute inset-x-2 -top-2 h-2 rounded-t-lg bg-neutral-300/20 dark:bg-neutral-600/15 -z-20" />

      {/* 2x2 preview grid */}
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5 p-1 aspect-square">
        {Array.from({ length: 4 }).map((_, i) => (
          <GroupPreviewCell key={i} asset={previewAssets[i]} />
        ))}
      </div>

      {/* Count badge */}
      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-semibold tabular-nums leading-none backdrop-blur-sm">
        {cluster.assets.length}
      </div>

      {/* Bottom label */}
      <div className="px-2 py-1.5 border-t border-neutral-200 dark:border-neutral-700">
        <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate leading-tight">
          {cluster.label}
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate leading-tight">
          {cluster.assets.length} items
          {latestTimestamp > 0 && <> &middot; {formatRelativeTime(latestTimestamp)}</>}
        </div>
      </div>

      {/* Expand hint on hover */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/cluster:bg-black/10 dark:group-hover/cluster:bg-white/5 transition-colors pointer-events-none">
        <div className="opacity-0 group-hover/cluster:opacity-100 transition-opacity bg-white/90 dark:bg-neutral-900/90 rounded-full p-1.5 shadow">
          <Icon name="chevronDown" size={14} className="text-neutral-600 dark:text-neutral-300" />
        </div>
      </div>
    </button>
  );
}
