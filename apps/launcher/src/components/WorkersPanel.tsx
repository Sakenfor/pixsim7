/**
 * Workers panel — live arq worker health + queue depth.
 *
 * Reads /workers/overview (launcher reads Redis directly), so it stays useful
 * even when the backend API is down but the workers are running. All five arq
 * worker families are shown: alive/stale, pending + active task counts, and
 * per-worker throughput/resource stats.
 */
import { useCallback, useEffect, useState } from 'react'
import { getWorkerOverview, type WorkerFamily, type WorkerOverview } from '../api/workers'
import { usePollWhenVisible } from '../hooks/usePollWhenVisible'

const POLL_INTERVAL = 3000

function fmtAge(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function fmtNum(n: number | null): string {
  return n == null ? '—' : String(n)
}

function fmtPct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`
}

function fmtMb(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)} MB`
}

/** A worker is "stale" if it claims alive but its heartbeat is older than ~1 cron cycle. */
function isStale(f: WorkerFamily): boolean {
  return f.alive && f.heartbeat_age_s != null && f.heartbeat_age_s > 45
}

function StatusDot({ f }: { f: WorkerFamily }) {
  const stale = isStale(f)
  const color = !f.alive ? 'bg-gray-600' : stale ? 'bg-amber-500' : 'bg-emerald-500'
  const title = !f.alive ? 'No heartbeat (down)' : stale ? `Stale heartbeat (${fmtAge(f.heartbeat_age_s)} ago)` : 'Healthy'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={title} />
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className={`tabular-nums text-[13px] font-semibold ${accent ?? 'text-gray-200'}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-gray-500">{label}</span>
    </div>
  )
}

function WorkerCard({ f }: { f: WorkerFamily }) {
  const active = f.active ?? 0
  const pending = f.pending ?? 0
  return (
    <div className="bg-surface-secondary rounded border border-border p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <StatusDot f={f} />
        <span className="text-[12px] font-semibold text-gray-100">{f.label}</span>
        <span className="text-[10px] text-gray-600">{f.role}</span>
        <div className="flex-1" />
        <span className="text-[9px] text-gray-600" title={f.queue}>
          {f.alive ? `up ${fmtAge(f.uptime_s)} · hb ${fmtAge(f.heartbeat_age_s)}` : 'offline'}
        </span>
      </div>

      <div className="flex items-stretch justify-between rounded bg-surface px-1 py-1.5">
        <Stat label="active" value={fmtNum(f.active)} accent={active > 0 ? 'text-blue-400' : 'text-gray-400'} />
        <Stat label="pending" value={fmtNum(f.pending)} accent={pending > 0 ? 'text-amber-400' : 'text-gray-400'} />
        <Stat label="done" value={fmtNum(f.processed_jobs)} />
        <Stat label="failed" value={fmtNum(f.failed_jobs)} accent={(f.failed_jobs ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'} />
        <Stat label="ok" value={f.success_rate == null ? '—' : `${Math.round(f.success_rate * 100)}%`} />
        <Stat label="cpu" value={fmtPct(f.cpu_percent)} />
        <Stat label="mem" value={fmtMb(f.memory_mb)} />
      </div>
    </div>
  )
}

export function WorkersPanel() {
  const [data, setData] = useState<WorkerOverview | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    const d = await getWorkerOverview()
    setData(d)
    setLoaded(true)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  usePollWhenVisible(refresh, POLL_INTERVAL, true)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">Workers</span>
        <span className="text-[10px] text-gray-500">arq families · live from Redis</span>
        <div className="flex-1" />
        {data && (
          <span className="text-[10px] text-gray-500">
            {data.redis_ok
              ? <>Redis <span className="text-emerald-400">ok</span>{data.in_progress_global != null ? ` · ${data.in_progress_global} in-progress` : ''}</>
              : <span className="text-red-400" title={data.error ?? ''}>Redis unreachable</span>}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {!loaded && <div className="text-[11px] text-gray-500 px-1 py-2">Loading workers…</div>}
        {loaded && !data && (
          <div className="text-[11px] text-gray-500 px-1 py-2">Could not reach the launcher workers endpoint.</div>
        )}
        {loaded && data && !data.redis_ok && (
          <div className="rounded border border-amber-700/40 bg-amber-900/15 px-2 py-1.5 text-[10px] text-amber-300">
            Redis is unreachable at <span className="font-mono">{data.redis_url}</span> — worker state can't be read.
            {data.error ? <> ({data.error})</> : null}
          </div>
        )}
        {data?.families.map((f) => <WorkerCard key={f.role} f={f} />)}
      </div>
    </div>
  )
}
