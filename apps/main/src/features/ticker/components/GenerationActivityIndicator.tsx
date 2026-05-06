/**
 * GenerationActivityIndicator — generations-specific spinning-gear badge.
 *
 * Used to live inside `NotificationTicker` as a conditional render of the
 * collapse-toggle button (gear+count when active, 📢 otherwise). Extracted
 * so the generic `<Ticker />` shell stays source-agnostic — this component
 * is opted into by surfaces that care about generation activity (the CC
 * dock toolbar today; potentially a status bar later).
 *
 * Hidden when no generations are active.
 */

import clsx from 'clsx';
import { useMemo } from 'react';

import { isActiveStatus } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';

interface Props {
  className?: string;
}

export function GenerationActivityIndicator({ className }: Props) {
  const generations = useGenerationsStore((s) => s.generations);

  const activeCount = useMemo(() => {
    let count = 0;
    generations.forEach((g) => {
      if (isActiveStatus(g.status)) count += 1;
    });
    return count;
  }, [generations]);

  if (activeCount === 0) return null;

  return (
    <span
      className={clsx(
        'flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded',
        'animate-pulse-subtle',
        className,
      )}
      title={`${activeCount} active generation${activeCount === 1 ? '' : 's'}`}
      aria-label={`${activeCount} active generation${activeCount === 1 ? '' : 's'}`}
    >
      <span className="animate-spin" aria-hidden="true">
        ⚙️
      </span>
      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
        {activeCount}
      </span>
    </span>
  );
}
