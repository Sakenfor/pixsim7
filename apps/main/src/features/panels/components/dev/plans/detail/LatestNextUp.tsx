/**
 * LatestNextUp - Surfaces the most recent work_summary `metadata.next`
 * entry for a plan, so when a user (or another agent) opens a plan they
 * see "where the previous session said to start."
 *
 * Reads /meta/agents/history?plan_id=X&action=work_summary&limit=1.
 * Renders nothing if there are no entries or the latest entry has no
 * `next` field.
 */

import { useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { Icon } from '@lib/icons';

interface NextUpEntry {
  detail: string;
  timestamp: string;
  agent_type?: string | null;
  session_id?: string | null;
  metadata?: {
    next?: string;
    decisions?: string[];
    blockers?: string[];
  } | null;
}

interface NextUpResponse {
  entries: NextUpEntry[];
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  return `${mo}mo ago`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function LatestNextUp({ planId, compact = false }: { planId: string; compact?: boolean }) {
  const [entry, setEntry] = useState<NextUpEntry | null>(null);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    pixsimClient
      .get<NextUpResponse>('/meta/agents/history', {
        params: { plan_id: planId, action: 'work_summary', limit: 1 },
      })
      .then((res) => {
        if (cancelled) return;
        const first = res.entries?.[0];
        setEntry(first ?? null);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const next = entry?.metadata?.next?.trim();
  if (!entry || !next) return null;

  const blockers = entry.metadata?.blockers ?? [];
  const decisions = entry.metadata?.decisions ?? [];
  const time = relativeTime(entry.timestamp);
  const actor = entry.agent_type || 'agent';
  const fullTitle = [
    `Logged ${time} by ${actor}`,
    '',
    next,
    decisions.length > 0 ? `\nDecisions: ${decisions.join('; ')}` : '',
    blockers.length > 0 ? `\nBlockers: ${blockers.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className="flex items-start gap-1.5 px-2 py-1.5 rounded border border-amber-300/60 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-[11px]"
      title={fullTitle}
    >
      <Icon name="bookmark" size={12} className="mt-0.5 flex-none text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold uppercase tracking-wide text-[9px] text-amber-700 dark:text-amber-300">
            Next
          </span>
          <span className="text-[9px] text-amber-700/70 dark:text-amber-400/70">
            {time} · {actor}
          </span>
          {blockers.length > 0 && (
            <span className="text-[9px] font-semibold text-red-500 dark:text-red-400">
              {blockers.length} blocker{blockers.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={compact ? 'truncate' : 'leading-relaxed'}>
          {compact ? truncate(next, 120) : next}
        </div>
      </div>
    </div>
  );
}
