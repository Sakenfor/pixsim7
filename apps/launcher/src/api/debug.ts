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

export async function getServiceLogging(serviceKey: string): Promise<LoggingState | null> {
  try {
    const res = await fetch(`/debug/${serviceKey}/logging`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
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

export async function patchLoggingConfig(patch: LoggingConfigPatch): Promise<LoggingConfig | null> {
  try {
    const res = await fetch('/debug/logging/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
