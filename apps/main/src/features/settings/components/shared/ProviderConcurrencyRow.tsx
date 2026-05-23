/**
 * Provider Concurrency health (Maintenance → Overview).
 *
 * Surfaces the runtime state of the adaptive provider-concurrency system and
 * the spurious-500044 quarantine (see plan `pixverse-spurious-concurrent-limit`):
 *  - per-account configured cap vs learned (degraded) cap + in-flight count
 *  - active prompt/image quarantines with TTL
 *  - actions: reset a degraded cap, lift a quarantine (+ resume its gens),
 *    resume all quarantine-paused generations
 */
import { Button, LoadingSpinner, StatusPill, type StatusTone } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api';
import { Icon } from '@lib/icons';

import { extractErrorMessage, maintGet } from './maintenanceShared';

const SURFACE = 'settings:provider-concurrency';
const STATUS_PATH = '/admin/provider-concurrency/status';

interface AccountStatus {
  id: number;
  nickname: string | null;
  provider_id: string;
  status: string;
  configured_cap: number;
  effective_cap: number | null;
  current_processing_jobs: number;
  degraded: boolean;
}

interface QuarantineEntry {
  provider_id: string;
  prompt_group_hash: string;
  account_id: number | null;
  trigger_generation_id: number | null;
  quarantined_at_ts: number | null;
  ttl_seconds: number | null;
}

interface ProviderConcurrencyStatus {
  settings: Record<string, number | boolean>;
  accounts: AccountStatus[];
  quarantines: QuarantineEntry[];
  paused_generation_count: number;
}

function fmtTtl(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function ProviderConcurrencyRow() {
  const [data, setData] = useState<ProviderConcurrencyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await maintGet<ProviderConcurrencyStatus>(STATUS_PATH, SURFACE));
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to load provider concurrency status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const runAction = useCallback(
    async (key: string, path: string, body?: unknown) => {
      setBusyKey(key);
      try {
        await pixsimClient.post(path, body, { headers: { 'X-Client-Surface': SURFACE } });
        await fetchStatus();
      } catch (err) {
        setError(extractErrorMessage(err) || 'Action failed');
      } finally {
        setBusyKey(null);
      }
    },
    [fetchStatus],
  );

  if (!data && loading) {
    return (
      <div className="flex items-center gap-3 py-8 px-6">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">Loading provider concurrency…</span>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex items-center gap-2 py-3 px-6 text-xs text-red-500">
        <Icon name="alertCircle" size={14} /> {error}
      </div>
    );
  }
  if (!data) return null;

  const quarantineEnabled = !!data.settings.spurious_concurrent_quarantine_enabled;
  const degradedAccounts = data.accounts.filter((a) => a.degraded);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-2xl">
      {/* Header */}
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Provider Concurrency</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Learned per-account caps and spurious concurrent-limit quarantines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <LoadingSpinner size="xs" />}
          <StatusPill tone={quarantineEnabled ? 'warning' : 'success'}>
            Quarantine {quarantineEnabled ? 'on' : 'off'}
          </StatusPill>
          <Button onClick={fetchStatus} disabled={loading} variant="outline" size="sm">
            <Icon name="refresh" size={12} />
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <Icon name="alertCircle" size={14} /> {error}
        </div>
      )}

      {/* Paused-by-quarantine banner */}
      {data.paused_generation_count > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/50 bg-amber-500/5 px-3 py-2">
          <span className="text-xs text-amber-700 dark:text-amber-300">
            {data.paused_generation_count} generation{data.paused_generation_count !== 1 ? 's' : ''} paused by quarantine
          </span>
          <Button
            onClick={() => runAction('resume-all', '/admin/provider-concurrency/resume-quarantined')}
            disabled={busyKey != null}
            variant="outline"
            size="sm"
          >
            {busyKey === 'resume-all' ? <LoadingSpinner size="xs" /> : 'Resume all'}
          </Button>
        </div>
      )}

      {/* Accounts */}
      <section className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Accounts {degradedAccounts.length > 0 && `· ${degradedAccounts.length} degraded`}
        </h3>
        <div className="space-y-1">
          {data.accounts.map((a) => {
            const tone: StatusTone = a.degraded ? 'warning' : 'success';
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs tabular-nums">
                <span className="w-[140px] shrink-0 truncate text-muted-foreground" title={a.nickname || String(a.id)}>
                  {a.nickname || `#${a.id}`}
                </span>
                <StatusPill tone={tone} className="shrink-0">
                  {a.degraded ? `${a.effective_cap}/${a.configured_cap}` : `${a.configured_cap}`}
                </StatusPill>
                <span className="text-muted-foreground/70 shrink-0">
                  {a.current_processing_jobs} in flight
                </span>
                <span className="flex-1" />
                {a.degraded && (
                  <Button
                    onClick={() => runAction(`reset-${a.id}`, '/admin/provider-concurrency/reset-cap', { account_id: a.id })}
                    disabled={busyKey != null}
                    variant="outline"
                    size="sm"
                  >
                    {busyKey === `reset-${a.id}` ? <LoadingSpinner size="xs" /> : 'Reset cap'}
                  </Button>
                )}
              </div>
            );
          })}
          {data.accounts.length === 0 && (
            <span className="text-xs text-muted-foreground">No accounts.</span>
          )}
        </div>
      </section>

      {/* Quarantines */}
      <section className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Active quarantines · {data.quarantines.length}
        </h3>
        {data.quarantines.length === 0 ? (
          <span className="text-xs text-muted-foreground">None — no prompts/images are quarantined.</span>
        ) : (
          <div className="space-y-1">
            {data.quarantines.map((q) => (
              <div key={`${q.provider_id}:${q.prompt_group_hash}`} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground shrink-0" title={q.prompt_group_hash}>
                  {q.prompt_group_hash.slice(0, 10)}…
                </span>
                <span className="text-muted-foreground/70 shrink-0">{q.provider_id}</span>
                {q.account_id != null && (
                  <span className="text-muted-foreground/50 shrink-0">acct {q.account_id}</span>
                )}
                <span className="text-muted-foreground/50 shrink-0 tabular-nums">ttl {fmtTtl(q.ttl_seconds)}</span>
                <span className="flex-1" />
                <Button
                  onClick={() =>
                    runAction(`clear-${q.prompt_group_hash}`, '/admin/provider-concurrency/clear-quarantine', {
                      provider_id: q.provider_id,
                      prompt_group_hash: q.prompt_group_hash,
                      resume_paused: true,
                    })
                  }
                  disabled={busyKey != null}
                  variant="outline"
                  size="sm"
                >
                  {busyKey === `clear-${q.prompt_group_hash}` ? <LoadingSpinner size="xs" /> : 'Clear + resume'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settings summary */}
      <section className="text-[11px] text-muted-foreground space-y-0.5">
        <div className="uppercase tracking-wider text-[10px] text-muted-foreground/60 mb-1">Active knobs</div>
        <div>Quarantine enabled: <span className="tabular-nums">{String(quarantineEnabled)}</span></div>
        <div>Idle-reject floor (local ≤): <span className="tabular-nums">{String(data.settings.spurious_concurrent_local_floor)}</span></div>
        <div>Quarantine threshold: <span className="tabular-nums">{String(data.settings.spurious_concurrent_quarantine_threshold)}</span> idle-rejects</div>
        <div>Count window: <span className="tabular-nums">{String(data.settings.spurious_concurrent_count_ttl_seconds)}s</span> · quarantine TTL: <span className="tabular-nums">{String(data.settings.prompt_concurrent_quarantine_ttl_seconds)}s</span></div>
        <div className="text-muted-foreground/60 pt-1">Tune these in Settings → Generation → worker config.</div>
      </section>
    </div>
  );
}
