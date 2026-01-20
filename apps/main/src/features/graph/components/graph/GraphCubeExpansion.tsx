import { useShallow } from 'zustand/react/shallow';

import type { ExpansionComponentProps } from '@features/cubes';

import { useGraphStore } from '../../stores/graphStore';
import { selectGraphStats } from '../../stores/graphStore/selectors';

/**
 * Graph status expansion for cube
 * Shows compact summary of scenes and nodes.
 *
 * Performance: Uses selectGraphStats which computes stats in a single selector,
 * avoiding multiple store subscriptions and redundant computations.
 */
export function GraphCubeExpansion(_props: ExpansionComponentProps) {
  void _props;

  // Single selector that computes all stats - avoids multiple subscriptions
  const stats = useGraphStore(useShallow(selectGraphStats));

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">Graph</span>
          <span className="text-sm font-semibold text-white">Overview</span>
        </div>
        <div className="text-xs text-white/50">
          {stats.sceneCount} {stats.sceneCount === 1 ? 'scene' : 'scenes'}
        </div>
      </div>

      {/* Current scene */}
      <div className="bg-white/5 rounded border border-white/10 px-2.5 py-2">
        <div className="text-[11px] text-white/50 mb-0.5">Current scene</div>
        <div className="text-xs font-medium text-white truncate">
          {stats.title}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-blue-500/15 border border-blue-500/30 rounded p-1.5">
          <div className="text-[10px] text-blue-200 mb-0.5">Nodes</div>
          <div className="text-base font-bold text-blue-100">
            {stats.nodeCount}
          </div>
        </div>
        <div className="bg-violet-500/15 border border-violet-500/30 rounded p-1.5">
          <div className="text-[10px] text-violet-200 mb-0.5">Edges</div>
          <div className="text-base font-bold text-violet-100">
            {stats.edgeCount}
          </div>
        </div>
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded p-1.5">
          <div className="text-[10px] text-emerald-200 mb-0.5">Scenes</div>
          <div className="text-base font-bold text-emerald-100">
            {stats.sceneCount}
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="pt-2 border-t border-white/10 text-[10px] text-white/30 text-center">
        Click cube to restore panel
      </div>
    </div>
  );
}
