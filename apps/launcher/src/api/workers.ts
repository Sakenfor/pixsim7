/**
 * Workers API client — arq worker health + queue depth, read by the launcher
 * straight from Redis (backend-independent). See launcher/api/routes/workers.py.
 */

export interface WorkerTask {
  name: string
  label: string
  runtime: boolean
}

export interface WorkerFamily {
  role: string
  label: string
  service_key: string
  queue: string
  description: string | null
  settings_class: string | null
  functions: WorkerTask[]
  cron_functions: WorkerTask[]
  /** Heartbeat key present in Redis (TTL'd) → worker is publishing. */
  alive: boolean
  heartbeat_age_s: number | null
  uptime_s: number | null
  hostname: string | null
  /** Jobs waiting in the queue (LLEN). */
  pending: number | null
  /** Jobs currently in-progress for this queue (ZCARD arq:in-progress:<queue>). */
  active: number | null
  processed_jobs: number | null
  failed_jobs: number | null
  success_rate: number | null
  memory_mb: number | null
  cpu_percent: number | null
}

export interface WorkerOverview {
  redis_url: string
  redis_ok: boolean
  /** Global arq in-progress count (fallback total across queues). */
  in_progress_global: number | null
  families: WorkerFamily[]
  error: string | null
}

export async function getWorkerOverview(): Promise<WorkerOverview | null> {
  try {
    const res = await fetch('/workers/overview')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
