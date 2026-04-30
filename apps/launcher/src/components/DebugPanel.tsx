/**
 * Debug panel — global logging config (editable) + per-service effective state (read-only).
 *
 * Top section: edits the canonical persisted config via the launcher API
 * proxy → backend's /api/v1/admin/logging/config. Changes apply to the
 * backend instantly and propagate to the worker on its next reload.
 *
 * Bottom section: shows the live in-memory state for the currently
 * selected service (read-only). Useful to confirm propagation. Workers
 * have no HTTP endpoint and won't appear here.
 */

import { useCallback, useEffect, useState } from 'react'
import { useServicesStore } from '../stores/services'
import {
  getDomainCatalog,
  getLoggingConfig,
  getServiceLogging,
  patchLoggingConfig,
  type DomainCatalog,
  type LoggingConfig,
  type LoggingConfigPatch,
  type LoggingState,
} from '../api/debug'

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
const DOMAIN_LEVEL_OPTIONS = [...LOG_LEVELS, 'OFF'] as const

export function DebugPanel() {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const services = useServicesStore((s) => s.services)
  const service = services.find((s) => s.key === selectedKey)

  const [catalog, setCatalog] = useState<DomainCatalog | null>(null)
  const [config, setConfig] = useState<LoggingConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Per-service status
  const [serviceState, setServiceState] = useState<LoggingState | null>(null)
  const [serviceLoading, setServiceLoading] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)

  // Load domain catalog + global config once
  useEffect(() => {
    getDomainCatalog().then(setCatalog)
    getLoggingConfig()
      .then((c) => {
        if (c) setConfig(c)
        else setConfigError('Could not reach backend admin endpoint — is the backend running and identity set up?')
      })
      .catch(() => setConfigError('Failed to fetch logging config'))
  }, [])

  // Load selected service state when selection changes
  useEffect(() => {
    if (!selectedKey) { setServiceState(null); setServiceError(null); return }
    setServiceLoading(true)
    setServiceError(null)
    getServiceLogging(selectedKey)
      .then((s) => {
        setServiceState(s)
        if (!s) setServiceError('No /_debug/logging endpoint on this service')
      })
      .catch(() => setServiceError('Failed to reach service'))
      .finally(() => setServiceLoading(false))
  }, [selectedKey])

  const applyPatch = useCallback(async (patch: LoggingConfigPatch) => {
    setSaving(true)
    try {
      const updated = await patchLoggingConfig(patch)
      if (updated) setConfig(updated)
      else setConfigError('Patch failed — see launcher logs')
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">Logging</span>
        <span className="text-[10px] text-gray-500">global config + per-service status</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ── Global config (editable) ── */}
        {!config && configError && (
          <div className="text-[11px] text-red-400 bg-surface-secondary rounded border border-border p-3">
            {configError}
          </div>
        )}

        {!config && !configError && (
          <div className="text-[11px] text-gray-500">Loading config...</div>
        )}

        {config && (
          <GlobalConfigSection
            config={config}
            catalog={catalog}
            saving={saving}
            onPatch={applyPatch}
          />
        )}

        {/* ── Per-service effective state (read-only) ── */}
        <ServiceStatusSection
          selectedKey={selectedKey}
          serviceTitle={service?.title}
          state={serviceState}
          catalog={catalog}
          loading={serviceLoading}
          error={serviceError}
        />
      </div>
    </div>
  )
}


// ── Global config section (editable) ──

function GlobalConfigSection({
  config, catalog, saving, onPatch,
}: {
  config: LoggingConfig
  catalog: DomainCatalog | null
  saving: boolean
  onPatch: (patch: LoggingConfigPatch) => void
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-1">
        Global Config <span className="font-normal lowercase text-gray-600">(applies to all services)</span>
      </div>

      {/* Levels */}
      <div className="bg-surface-secondary rounded border border-border p-3 space-y-2">
        <Row label="Global Log Level" hint="Minimum severity for all domains">
          <select
            value={config.log_level}
            disabled={saving}
            onChange={(e) => onPatch({ log_level: e.target.value })}
            className="px-2 py-1 text-[11px] rounded border border-border bg-surface text-gray-200 focus:border-blue-500 outline-none disabled:opacity-50"
          >
            {LOG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Row>

        <Row label="DB Ingestion Level" hint="Minimum severity written to log database">
          <select
            value={config.log_db_min_level}
            disabled={saving}
            onChange={(e) => onPatch({ log_db_min_level: e.target.value })}
            className="px-2 py-1 text-[11px] rounded border border-border bg-surface text-gray-200 focus:border-blue-500 outline-none disabled:opacity-50"
          >
            {LOG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Row>

        <Row label="Retention" hint="Days to keep log entries (1–365)">
          <RetentionInput
            value={config.log_retention_days}
            saving={saving}
            onCommit={(days) => onPatch({ log_retention_days: days })}
          />
        </Row>
      </div>

      {/* Domain overrides */}
      {catalog && catalog.groups.length > 0 && (
        <DomainOverridesEdit
          catalog={catalog}
          domainLevels={config.log_domain_levels}
          saving={saving}
          onUpdate={(levels) => onPatch({ log_domain_levels: levels })}
        />
      )}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0 pr-3">
        <div className="text-[11px] font-medium text-gray-200">{label}</div>
        {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function RetentionInput({
  value, saving, onCommit,
}: {
  value: number
  saving: boolean
  onCommit: (days: number) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={365}
        value={local}
        disabled={saving}
        onChange={(e) => setLocal(parseInt(e.target.value || '0', 10))}
        onBlur={() => { if (local !== value && local >= 1 && local <= 365) onCommit(local) }}
        className="w-16 px-1.5 py-0.5 text-[11px] text-right rounded border border-border bg-surface text-gray-200 focus:border-blue-500 outline-none disabled:opacity-50 tabular-nums"
      />
      <span className="text-[10px] text-gray-500">d</span>
    </div>
  )
}

function DomainOverridesEdit({
  catalog, domainLevels, saving, onUpdate,
}: {
  catalog: DomainCatalog
  domainLevels: Record<string, string>
  saving: boolean
  onUpdate: (levels: Record<string, string>) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const debugCount = Object.values(domainLevels).filter((v) => v.toUpperCase() === 'DEBUG').length
  const overrideCount = Object.keys(domainLevels).length

  const handleChange = (domain: string, level: string) => {
    const next = { ...domainLevels }
    if (level === '') delete next[domain]
    else next[domain] = level
    onUpdate(next)
  }

  const reset = () => onUpdate({})

  return (
    <div className="bg-surface-secondary rounded border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border hover:bg-surface/40 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Domain Levels
          <span className="ml-1 font-normal lowercase text-gray-600">(set DEBUG to enable per-category)</span>
        </span>
        <span className="flex items-center gap-1.5">
          {debugCount > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">
              {debugCount} DEBUG
            </span>
          )}
          {overrideCount > debugCount && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-surface text-gray-400">
              {overrideCount - debugCount} other
            </span>
          )}
          <span className="text-[10px] text-gray-500">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      {expanded && (
        <>
          {catalog.groups.map((group) => (
            <div key={group.id}>
              <div className="px-3 py-1 bg-surface/40 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                {group.label}
              </div>
              {group.domains.map((domain) => {
                const current = domainLevels[domain] ?? ''
                const isDebug = current.toUpperCase() === 'DEBUG'
                const isOverridden = !!current
                return (
                  <div key={domain} className="flex items-center justify-between px-3 py-1 border-t border-border/50">
                    <span className={`text-[11px] ${isOverridden ? 'font-medium text-gray-200' : 'text-gray-500'}`}>
                      {domain}
                    </span>
                    <select
                      value={current}
                      disabled={saving}
                      onChange={(e) => handleChange(domain, e.target.value)}
                      className={`px-1.5 py-0.5 text-[10px] rounded border bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${
                        isDebug
                          ? 'border-blue-700 text-blue-400 font-medium'
                          : isOverridden
                            ? 'border-border text-gray-300'
                            : 'border-border text-gray-500'
                      }`}
                    >
                      <option value="">default</option>
                      {DOMAIN_LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
          ))}
          {overrideCount > 0 && (
            <div className="px-3 py-2 border-t border-border flex justify-end">
              <button
                onClick={reset}
                disabled={saving}
                className="text-[10px] px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-gray-400 disabled:opacity-50"
              >
                Reset all
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── Per-service status section (read-only) ──

function ServiceStatusSection({
  selectedKey, serviceTitle, state, catalog, loading, error,
}: {
  selectedKey: string | null
  serviceTitle?: string
  state: LoggingState | null
  catalog: DomainCatalog | null
  loading: boolean
  error: string | null
}) {
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="space-y-2 pt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-1">
        Service Status
        <span className="ml-1 font-normal lowercase text-gray-600">
          ({selectedKey ? `live state of ${serviceTitle ?? selectedKey}` : 'select a service'})
        </span>
      </div>

      {!selectedKey && (
        <div className="text-[10px] text-gray-600 bg-surface-secondary/50 rounded border border-border/60 px-3 py-2">
          Click a service in the Services panel to inspect its live logging state.
        </div>
      )}

      {selectedKey && loading && (
        <div className="text-[11px] text-gray-500 px-1">Loading...</div>
      )}

      {selectedKey && error && !state && (
        <div className="text-[11px] text-gray-500 bg-surface-secondary rounded border border-border p-3">
          <div className="text-gray-400 mb-1 select-text whitespace-pre-wrap break-words">{error}</div>
          <div className="text-[10px] text-gray-600">
            Workers don't expose an HTTP endpoint and won't show live state here. They reload from
            the persisted config periodically (check worker logs for the next reload tick).
          </div>
        </div>
      )}

      {state && (
        <div className="bg-surface-secondary rounded border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div>
              <span className="text-[11px] font-medium text-gray-200">Effective in this process</span>
              <span className="text-[10px] text-gray-500 ml-2">
                level <span className="text-gray-300">{state.level}</span>
                {' · '}
                {Object.keys(state.domains).length} override{Object.keys(state.domains).length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              onClick={() => setShowAll(!showAll)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${showAll ? 'bg-blue-900/30 text-blue-400' : 'bg-surface text-gray-500 hover:text-gray-300'}`}
            >
              {showAll ? 'Active' : 'All'}
            </button>
          </div>
          <ServiceDomainList state={state} catalog={catalog} showAll={showAll} />
        </div>
      )}
    </div>
  )
}

function ServiceDomainList({
  state, catalog, showAll,
}: {
  state: LoggingState
  catalog: DomainCatalog | null
  showAll: boolean
}) {
  const activeSet = new Set(state.active_domains ?? [])

  if (!catalog || catalog.groups.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-gray-500">
        Domain catalog unavailable.
      </div>
    )
  }

  const filteredGroups = catalog.groups
    .map((group) => ({
      ...group,
      domains: showAll ? group.domains : group.domains.filter((d) => activeSet.has(d) || state.domains[d]),
    }))
    .filter((group) => group.domains.length > 0)

  if (filteredGroups.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-gray-500">
        No domain activity yet. Toggle "All" to see all available domains.
      </div>
    )
  }

  return (
    <>
      {filteredGroups.map((group) => (
        <div key={group.id}>
          <div className="px-3 py-1 bg-surface/40 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
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
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded border bg-surface ${
                    isOverridden ? 'border-blue-700 text-blue-400' : 'border-border text-gray-500'
                  }`}
                >
                  {current || 'default'}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
