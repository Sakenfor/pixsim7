/**
 * Debug panel — per-service runtime log level and domain control.
 *
 * Shows the currently selected service's logging state and lets you
 * change the global level or per-domain overrides without restarting.
 * Services without a debug endpoint show a "not available" message.
 */

import { useState, useEffect, useCallback } from 'react'
import { useServicesStore } from '../stores/services'
import {
  getDomainCatalog, getServiceLogging, setServiceLevel, setServiceDomains,
  type LoggingState, type DomainCatalog,
} from '../api/debug'

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const

export function DebugPanel() {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const services = useServicesStore((s) => s.services)
  const service = services.find((s) => s.key === selectedKey)

  const [catalog, setCatalog] = useState<DomainCatalog | null>(null)
  const [state, setState] = useState<LoggingState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load domain catalog once
  useEffect(() => { getDomainCatalog().then(setCatalog) }, [])

  // Load service logging state when selection changes
  useEffect(() => {
    if (!selectedKey) { setState(null); return }
    setLoading(true)
    setError(null)
    getServiceLogging(selectedKey)
      .then((s) => {
        setState(s)
        if (!s) setError('No debug endpoint available for this service')
      })
      .catch(() => setError('Failed to reach service'))
      .finally(() => setLoading(false))
  }, [selectedKey])

  const handleLevelChange = useCallback(async (level: string) => {
    if (!selectedKey) return
    const result = await setServiceLevel(selectedKey, level)
    if (result) setState(result)
  }, [selectedKey])

  const handleDomainChange = useCallback(async (domain: string, level: string) => {
    if (!selectedKey || !state) return
    const next = { ...state.domains }
    if (!level || level === 'default') {
      delete next[domain]
    } else {
      next[domain] = level
    }
    const result = await setServiceDomains(selectedKey, next)
    if (result) setState(result)
  }, [selectedKey, state])

  const handleResetDomains = useCallback(async () => {
    if (!selectedKey) return
    const result = await setServiceDomains(selectedKey, {})
    if (result) setState(result)
  }, [selectedKey])

  const title = service?.title ?? selectedKey

  if (!selectedKey) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-[11px]">
        Select a service to configure debug logging
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">{title}</span>
        <span className="text-[10px] text-gray-500">Debug</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && <div className="text-[11px] text-gray-500">Loading...</div>}

        {error && !state && (
          <div className="text-[11px] text-gray-500 bg-surface-secondary rounded border border-border p-3">
            <div className="text-gray-400 mb-1 select-text whitespace-pre-wrap break-words">{error}</div>
            <div className="text-[10px] text-gray-600">
              This service may not support runtime debug control.
              Try setting <code className="text-gray-400">PIXSIM_LOG_LEVEL=DEBUG</code> in its environment and restarting.
            </div>
          </div>
        )}

        {state && (
          <>
            {/* Global level */}
            <div className="bg-surface-secondary rounded border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-gray-200">Log Level</div>
                  <div className="text-[10px] text-gray-500">Global minimum severity (runtime, no restart)</div>
                </div>
                <select
                  value={state.level}
                  onChange={(e) => handleLevelChange(e.target.value)}
                  className="px-2 py-1 text-[11px] rounded border border-border bg-surface text-gray-200 focus:border-blue-500 outline-none"
                >
                  {LOG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Domain overrides */}
            {catalog && catalog.groups.length > 0 && (
              <DomainOverrides
                catalog={catalog}
                state={state}
                onDomainChange={handleDomainChange}
                onReset={handleResetDomains}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}


// ── Domain overrides with active-domain filtering ──

const LOG_LEVEL_OPTIONS = [...LOG_LEVELS, 'OFF'] as const

function DomainOverrides({ catalog, state, onDomainChange, onReset }: {
  catalog: DomainCatalog
  state: LoggingState
  onDomainChange: (domain: string, level: string) => void
  onReset: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const activeSet = new Set(state.active_domains ?? [])
  const overriddenCount = Object.keys(state.domains).length

  // Filter groups to only show domains the service has seen (unless showAll)
  const filteredGroups = catalog.groups
    .map((group) => ({
      ...group,
      domains: showAll ? group.domains : group.domains.filter((d) => activeSet.has(d) || state.domains[d]),
    }))
    .filter((group) => group.domains.length > 0)

  return (
    <div className="bg-surface-secondary rounded border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div>
          <span className="text-[11px] font-medium text-gray-200">Domain Overrides</span>
          <span className="text-[10px] text-gray-500 ml-2">
            {overriddenCount > 0 ? `${overriddenCount} active` : 'all inherit global'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowAll(!showAll)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${showAll ? 'bg-blue-900/30 text-blue-400' : 'bg-surface text-gray-500 hover:text-gray-300'}`}
          >
            {showAll ? 'Active' : 'All'}
          </button>
          {overriddenCount > 0 && (
            <button onClick={onReset} className="text-[10px] px-1.5 py-0.5 rounded bg-surface hover:bg-surface-hover text-gray-400">
              Reset
            </button>
          )}
        </div>
      </div>

      {filteredGroups.length === 0 && (
        <div className="px-3 py-3 text-[10px] text-gray-500">
          No domain activity yet. Toggle "All" to see all available domains.
        </div>
      )}

      {filteredGroups.map((group) => (
        <div key={group.id}>
          <div className="px-3 py-1 bg-surface/50 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
            {group.label}
          </div>
          {group.domains.map((domain) => {
            const current = state.domains[domain] ?? ''
            const isOverridden = !!current
            const isActive = activeSet.has(domain)
            return (
              <div key={domain} className="flex items-center justify-between px-3 py-1 border-t border-border/50">
                <span className={`text-[11px] ${isOverridden ? 'font-medium text-gray-200' : isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                  {domain}
                  {!isActive && <span className="text-[9px] text-gray-600 ml-1">(unused)</span>}
                </span>
                <select
                  value={current}
                  onChange={(e) => onDomainChange(domain, e.target.value)}
                  className={`px-1.5 py-0.5 text-[10px] rounded border bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isOverridden ? 'border-blue-700 text-blue-400' : 'border-border text-gray-500'
                  }`}
                >
                  <option value="">default</option>
                  {LOG_LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
