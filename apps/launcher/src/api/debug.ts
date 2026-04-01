/**
 * Debug API client — runtime log level / domain control per service.
 *
 * Talks to the launcher API proxy at /debug/{serviceKey}/logging,
 * which forwards to each service's /_debug/logging endpoint.
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

export async function setServiceLevel(serviceKey: string, level: string): Promise<LoggingState | null> {
  try {
    const res = await fetch(`/debug/${serviceKey}/logging/level`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function setServiceDomains(serviceKey: string, domains: Record<string, string>): Promise<LoggingState | null> {
  try {
    const res = await fetch(`/debug/${serviceKey}/logging/domains`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains }),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
