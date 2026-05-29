import { useEffect, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

import type { ManagedProcess } from './assistantChatBridge';

const KIND_META: Record<ManagedProcess['kind'], { icon: IconName; tag: string }> = {
  subagent: { icon: 'users', tag: 'subagent' },
  background_task: { icon: 'cpu', tag: 'bg' },
};

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Live, per-session list of the sub-processes the agent launched this turn —
 * subagents (Task/Agent) and background shell tasks (Bash run_in_background).
 * Fed from `BridgeRequest.managedProcesses` (folded from `managed_proc_*`
 * heartbeats). Per-turn scope: only shown while the turn is active.
 */
export function SessionManagedProcesses({
  processes,
  active,
}: {
  processes?: Record<string, ManagedProcess>;
  active: boolean;
}) {
  const list = processes ? Object.values(processes) : [];
  const hasRunning = list.some((p) => p.status === 'running');

  // Tick once a second while something runs so the elapsed clock advances
  // between (sparse) heartbeats during a long subagent.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !hasRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active, hasRunning]);

  if (!active || list.length === 0) return null;

  const sorted = [...list].sort((a, b) => a.startedAt - b.startedAt);
  const now = Date.now();

  return (
    <div className="px-1 pb-1">
      <div className="text-[9px] font-medium text-th opacity-60 mb-0.5">
        Managed processes ({list.length})
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((p) => {
          const meta = KIND_META[p.kind];
          const running = p.status === 'running';
          return (
            <div key={p.id} className="flex items-center gap-1.5 text-[10px] text-th min-w-0">
              <Icon name={meta.icon} size={10} />
              <span className="opacity-50">{meta.tag}</span>
              <span className="truncate flex-1 min-w-0" title={p.label}>{p.label}</span>
              <span className={running ? 'text-accent tabular-nums' : 'opacity-50'}>
                {running ? `running ${fmtElapsed(now - p.startedAt)}` : 'done'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
