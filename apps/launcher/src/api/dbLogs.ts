/**
 * Backend DB log query client.
 * Talks to the main backend API (not the launcher API).
 */

const BACKEND_BASE = 'http://localhost:8000'

export interface LogEntry {
  id: number
  timestamp: string
  level: string
  service: string
  env: string
  msg: string | null
  request_id: string | null
  job_id: number | null
  submission_id: number | null
  provider_job_id: string | null
  provider_id: string | null
  operation_type: string | null
  stage: string | null
  user_id: number | null
  error: string | null
  error_type: string | null
  duration_ms: number | null
  attempt: number | null
  extra: Record<string, unknown>
}

export interface LogQueryResponse {
  items: LogEntry[]
  total: number
  has_more: boolean
}

export interface LogQueryParams {
  level?: string
  service?: string
  search?: string
  stage?: string
  channel?: string
  provider_id?: string
  job_id?: number
  request_id?: string
  minutes?: number
  limit?: number
  offset?: number
}

export async function queryDbLogs(params: LogQueryParams = {}): Promise<LogQueryResponse> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
  }
  const res = await fetch(`${BACKEND_BASE}/api/v1/logs/query?${qs}`)
  if (!res.ok) throw new Error(`DB log query failed: ${res.status}`)
  return res.json()
}

export async function getJobTrace(jobId: number): Promise<LogEntry[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/logs/trace/job/${jobId}`)
  if (!res.ok) throw new Error(`Job trace failed: ${res.status}`)
  return res.json()
}

export async function getRequestTrace(requestId: string): Promise<LogEntry[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/logs/trace/request/${requestId}`)
  if (!res.ok) throw new Error(`Request trace failed: ${res.status}`)
  return res.json()
}

/**
 * Convert a structured LogEntry into a flat log line string for LogLine rendering.
 */
export function logEntryToLine(entry: LogEntry): string {
  const parts: string[] = []
  parts.push(entry.timestamp)
  parts.push(`[${entry.level}]`)
  parts.push(entry.service)

  if (entry.msg) parts.push(entry.msg)

  // Append key fields inline
  if (entry.request_id) parts.push(`request_id=${entry.request_id}`)
  if (entry.job_id) parts.push(`job_id=${entry.job_id}`)
  if (entry.provider_id) parts.push(`provider_id=${entry.provider_id}`)
  if (entry.provider_job_id) parts.push(`provider_job_id=${entry.provider_job_id}`)
  if (entry.submission_id) parts.push(`submission_id=${entry.submission_id}`)
  if (entry.user_id) parts.push(`user_id=${entry.user_id}`)
  if (entry.stage) parts.push(`stage=${entry.stage}`)
  if (entry.operation_type) parts.push(`operation_type=${entry.operation_type}`)
  if (entry.duration_ms != null) parts.push(`duration_ms=${entry.duration_ms}`)
  if (entry.error_type) parts.push(`error_type=${entry.error_type}`)
  if (entry.error) parts.push(`error=${entry.error}`)

  // Flatten extra fields
  if (entry.extra) {
    for (const [k, v] of Object.entries(entry.extra)) {
      if (v != null && v !== '') parts.push(`${k}=${v}`)
    }
  }

  return parts.join(' ')
}
