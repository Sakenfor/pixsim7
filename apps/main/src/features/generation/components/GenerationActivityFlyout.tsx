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
 * the notifications bell. The grouped body is shared with the inline pause
 * toast via GenerationGroupList.
 */
import { useMemo } from 'react';

import { Icon, type IconName } from '@lib/icons';

import { type GenerationGroupBy } from '../lib/generationGrouping';
import { isActiveStatus } from '../models';
import { useGenerationActivityFlyoutStore } from '../stores/generationActivityFlyoutStore';
import { useGenerationsStore } from '../stores/generationsStore';

import { GenerationGroupList } from './GenerationGroupList';

interface GenerationActivityFlyoutProps {
  groupBy: GenerationGroupBy;
  onChangeGroupBy: (next: GenerationGroupBy) => void;
  onOpenFullPanel: () => void;
  onClose: () => void;
  isConnected: boolean;
  onReconnect: () => void;
}

export function GenerationActivityFlyout({
  groupBy,
  onChangeGroupBy,
  onOpenFullPanel,
  onClose,
  isConnected,
  onReconnect,
}: GenerationActivityFlyoutProps) {
  const generations = useGenerationsStore((s) => s.generations);
  const countMode = useGenerationActivityFlyoutStore((s) => s.countMode);
  const setCountMode = useGenerationActivityFlyoutStore((s) => s.setCountMode);
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

  return (
    <div className="w-[380px] h-[440px] max-h-[80vh] flex flex-col bg-neutral-900/95 border border-neutral-700/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
      {/* Header — compact, icon-driven. The gem widget this flyout anchors to
          already identifies it, so the textual "Generation activity" title is
          dropped; the active/paused count badge carries the only label. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-700/40">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCountMode(countMode === 'active' ? 'paused' : 'active')}
          className={`px-2 h-5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold leading-none whitespace-nowrap transition-colors ${
            countMode === 'active'
              ? 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
              : 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
          }`}
          title={`Showing ${headerLabel} count. Click to toggle active/paused.`}
          aria-label={`Showing ${headerLabel} count. Click to toggle active or paused count.`}
        >
          {headerCount} {headerLabel}
        </button>
        <div className="flex items-center gap-1">
          <div className="flex rounded bg-neutral-800 p-0.5">
            {([
              ['prompt', 'prompt'],
              ['asset', 'image'],
            ] as Array<[GenerationGroupBy, IconName]>).map(([dim, icon]) => (
              <button
                key={dim}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChangeGroupBy(dim)}
                className={`p-1 rounded transition-colors ${
                  groupBy === dim
                    ? 'bg-neutral-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title={`Group by ${dim}`}
                aria-label={`Group by ${dim}`}
                aria-pressed={groupBy === dim}
              >
                <Icon name={icon} size={13} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onOpenFullPanel}
            className="p-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
            title="Open the full generations panel"
            aria-label="Open the full generations panel"
          >
            <Icon name="externalLink" size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 p-1 rounded hover:bg-neutral-700/50 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto">
        <GenerationGroupList
          generations={visibleGenerations}
          groupBy={groupBy}
          tone={countMode}
          emptyLabel={countMode === 'active' ? 'No active generations' : 'No paused generations'}
        />
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
