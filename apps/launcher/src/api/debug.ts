/**
 * Debug API client.
 *
 * - Global logging config (R/W) — proxied through the launcher API to the
 *   backend's /api/v1/admin/logging/config (canonical persisted config).
 * - Per-service effective state (R) — proxied through the launcher API to
 *   each service's /_debug/logging (live in-memory state).
 * - Domain catalog (R) — static metadata.
 */

export interface LoggingState {
  level: string
  domains: Record<string, string>
  active_domains?: string[]
}

export interface DomainGroup {
  id: string
  label: string
  domains: string[]
}

export interface DomainCatalog {
  domains: string[]
  groups: DomainGroup[]
}

export interface LoggingConfig {
  log_level: string
  log_db_min_level: string
  log_retention_days: number
  log_domain_levels: Record<string, string>
  /** Echo every SQL statement (SQLAlchemy echo) across all backend DB engines — live, debug only. */
  sql_logging: boolean
  /**
   * 'backend' = canonical persisted config; 'launcher-local' = degraded
   * fallback served from the launcher-api process when the backend is
   * unreachable. In launcher-local mode edits apply to the launcher process
   * only and are NOT persisted; DB level + retention are backend-owned.
   */
  source?: 'backend' | 'launcher-local'
}

export type LoggingConfigPatch = Partial<LoggingConfig>

let _domainCatalog: DomainCatalog | null = null

export async function getDomainCatalog(): Promise<DomainCatalog> {
  if (_domainCatalog) return _domainCatalog
  const res = await fetch('/debug/meta/domains')
  if (!res.ok) return { domains: [], groups: [] }
  _domainCatalog = await res.json()
  return _domainCatalog!
}

/**
 * Per-service logging fetch result.
 *
 * `no-endpoint` = backend reported the service has no /_debug/logging surface
 * (no health_url and no debug_port_file). Render nothing in this case.
 * `unreachable` = service should have an endpoint but the proxy fetch failed
 * (process down, hung, network blip). Render an error badge.
 */
export type ServiceLoggingResult =
  | { kind: 'state'; state: LoggingState }
  | { kind: 'no-endpoint' }
  | { kind: 'unreachable' }

export async function getServiceLogging(serviceKey: string): Promise<ServiceLoggingResult> {
  try {
    const res = await fetch(`/debug/${serviceKey}/logging`)
    if (res.status === 404) return { kind: 'no-endpoint' }
    if (!res.ok) return { kind: 'unreachable' }
    return { kind: 'state', state: await res.json() }
  } catch {
    return { kind: 'unreachable' }
  }
}

export async function getLoggingConfig(): Promise<LoggingConfig | null> {
  try {
    const res = await fetch('/debug/logging/config')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export type PatchLoggingConfigResult =
  | { ok: true; config: LoggingConfig }
  | { ok: false; reason: string }

export async function patchLoggingConfig(patch: LoggingConfigPatch): Promise<PatchLoggingConfigResult> {
  try {
    const res = await fetch('/debug/logging/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      let reason = `HTTP ${res.status}`
      try {
        const body = await res.json()
        if (body?.detail) reason = String(body.detail)
      } catch {
        // body wasn't JSON; keep status code as reason
      }
      return { ok: false, reason }
    }
    return { ok: true, config: await res.json() }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Network error' }
  }
}
