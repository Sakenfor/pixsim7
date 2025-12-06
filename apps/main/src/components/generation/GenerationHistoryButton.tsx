import React from 'react';
import clsx from 'clsx';
import { ExpandableButtonGroup } from '@pixsim7/shared.ui';
import { ThemedIcon } from '@/lib/icons';
import { useGenerationsStore } from '@/stores/generationsStore';
import { useRecentGenerations } from '@/hooks/useRecentGenerations';
import type { GenerationResponse } from '@/lib/api/generations';

const STATUS_BADGE: Record<GenerationResponse['status'] | 'default', string> = {
  pending:
    'bg-yellow-50/80 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800',
  queued:
    'bg-amber-50/80 dark:bg-amber-950/20 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-800',
  processing:
    'bg-blue-50/80 dark:bg-blue-950/20 text-blue-700 dark:text-blue-200 border border-blue-200 dark:border-blue-800',
  completed:
    'bg-green-50/80 dark:bg-green-950/20 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-800',
  failed:
    'bg-red-50/80 dark:bg-red-950/20 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800',
  cancelled:
    'bg-neutral-50/80 dark:bg-neutral-950/20 text-neutral-600 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700',
  default:
    'bg-neutral-100/80 dark:bg-neutral-900/30 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700',
};

const HISTORY_LIMIT = 5;

export interface GenerationHistoryButtonProps {
  direction: 'up' | 'down' | 'left' | 'right';
}

export function GenerationHistoryButton({ direction }: GenerationHistoryButtonProps) {
  const generations = useGenerationsStore((s) => s.generations);
  const { isLoading, hasFetched } = useRecentGenerations({ limit: HISTORY_LIMIT });

  const generationArray = React.useMemo(() => {
    const entries = Array.from(generations.values());
    return entries
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || '').getTime();
        const bTime = new Date(b.updated_at || b.created_at || '').getTime();
        return bTime - aTime;
      })
      .slice(0, HISTORY_LIMIT);
  }, [generations]);

  const hasHistory = generationArray.length > 0;

  return (
    <ExpandableButtonGroup
      trigger={
        <button
          className="text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-1"
          title="Recent jobs & prompts"
        >
          <ThemedIcon name="listPlus" size={12} variant="default" />
          <span className="hidden sm:inline">Recents</span>
        </button>
      }
      direction={direction}
      offset={6}
      hoverDelay={150}
      contentClassName="right-0"
    >
      <div className="w-80 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 shadow-2xl p-3">
        <div className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1">
          Recent generations
        </div>

        {isLoading && !hasFetched ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasHistory ? (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 py-4 text-center">
            No recent generations
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {generationArray.map((generation) => {
              const prompt =
                generation.final_prompt ||
                generation.raw_params?.prompt ||
                generation.canonical_params?.prompt ||
                '';
              const label =
                prompt.trim().length > 0
                  ? prompt.trim()
                  : `${generation.provider_id} - ${generation.operation_type}`;
              const timestamp = generation.updated_at || generation.created_at;
              const timeLabel = timestamp
                ? new Date(timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;
              const badgeClass = STATUS_BADGE[generation.status] ?? STATUS_BADGE.default;

              return (
                <div
                  key={generation.id}
                  className="rounded-md px-2 py-1.5 bg-neutral-50/90 dark:bg-neutral-900/40 border border-neutral-100 dark:border-neutral-800"
                >
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="truncate">
                      #{generation.id} · {generation.provider_id}
                    </span>
                    {timeLabel && <span>{timeLabel}</span>}
                  </div>
                  <div className="text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-words max-h-20 overflow-hidden">
                    {label}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <span>{generation.operation_type}</span>
                    <span
                      className={clsx(
                        'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                        badgeClass
                      )}
                    >
                      {generation.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ExpandableButtonGroup>
  );
}
