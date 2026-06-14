/**
 * Debug panel — global logging config (editable) + inline propagation badges.
 *
 * Top section edits the canonical persisted config via the launcher API
 * proxy → backend's /api/v1/admin/logging/config. Changes apply to the
 * backend instantly and propagate to the worker on its next reload.
 *
 * Inline propagation row shows one badge per running service that exposes
 * a /_debug/logging endpoint, indicating whether each picked up the latest
 * global config. Services without an endpoint (frontend, db, headless
 * workers) are hidden — workers reload from persisted config on a cron.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input, Select } from '@pixsim7/shared.ui'
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
  type ServiceLoggingResult,
} from '../api/debug'

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
const DOMAIN_LEVEL_OPTIONS = [...LOG_LEVELS, 'OFF'] as const

export function DebugPanel() {
  const services = useServicesStore((s) => s.services)
  const runningKeys = useMemo(
    () => services.filter((s) => s.status === 'running').map((s) => s.key),
    [services],
  )
  const runningKeysJoined = runningKeys.join(',')

  const [catalog, setCatalog] = useState<DomainCatalog | null>(null)
  const [config, setConfig] = useState<LoggingConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [propagation, setPropagation] = useState<Map<string, ServiceLoggingResult>>(new Map())
  const propagationVersion = useRef(0)

  // Fetch the logging config. Returns the config (or null if even the
  // launcher-api endpoint is unreachable). The launcher API itself falls back
  // to launcher-local state when the backend is down, so a null here means the
  // launcher process — not just the backend — couldn't be reached.
  const loadConfig = useCallback(async () => {
    try {
      const c = await getLoggingConfig()
      if (c) {
        setConfig(c)
        setConfigError(null)
      } else {
        setConfigError('Could not reach the launcher logging endpoint')
      }
      return c
    } catch {
      setConfigError('Failed to fetch logging config')
      return null
    }
  }, [])

  // Load domain catalog + global config once on mount.
  useEffect(() => {
    getDomainCatalog().then(setCatalog)
    loadConfig()
  }, [loadConfig])

  // While running on the launcher-local fallback (backend offline), re-check
  // periodically so the panel upgrades back to the canonical persisted config
  // the moment the backend comes up — no manual refresh / restart needed.
  useEffect(() => {
    if (config?.source !== 'launcher-local') return
    const id = setInterval(() => { loadConfig() }, 5000)
    return () => clearInterval(id)
  }, [config?.source, loadConfig])

  // Refetch propagation whenever the running-services set changes, and
  // post-PATCH (scheduled by applyPatch). Uses a version ref to drop stale
  // responses if the running set churns mid-flight.
  const refetchPropagation = useCallback(async () => {
    const myVersion = ++propagationVersion.current
    const keys = runningKeysJoined ? runningKeysJoined.split(',') : []
    const entries = await Promise.all(
      keys.map(async (k) => [k, await getServiceLogging(k)] as const),
    )
    if (myVersion !== propagationVersion.current) return
    const next = new Map<string, ServiceLoggingResult>()
    for (const [k, r] of entries) {
      if (r.kind !== 'no-endpoint') next.set(k, r)
    }
    setPropagation(next)
  }, [runningKeysJoined])

  useEffect(() => {
    refetchPropagation()
  }, [refetchPropagation])

  // Latest-refetch ref so post-PATCH setTimeouts always pick up the current
  // running-services set. Without this, stopping a service within 5s of a
  // PATCH causes the stale closure to re-fetch and re-add the just-stopped
  // service as ✕ (visible as "frontend propagation is wrong").
  const refetchRef = useRef(refetchPropagation)
  useEffect(() => {
    refetchRef.current = refetchPropagation
  }, [refetchPropagation])

  const applyPatch = useCallback(
    async (patch: LoggingConfigPatch) => {
      setSaving(true)
      setConfigError(null)
      try {
        const result = await patchLoggingConfig(patch)
        if (result.ok) {
          setConfig(result.config)
        } else {
          setConfigError(`Patch failed: ${result.reason}`)
        }
        // Catch the worker's Redis push (sub-second) and any slower reload.
        setTimeout(() => refetchRef.current(), 1000)
        setTimeout(() => refetchRef.current(), 5000)
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold text-gray-300">Logging</span>
        <span className="text-[10px] text-gray-500">global config + propagation</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {configError && (
          <div className="text-[11px] text-red-400 bg-surface-secondary rounded border border-border p-3 flex items-start gap-2">
            <span className="flex-1">{configError}</span>
            <button
              onClick={() => setConfigError(null)}
              className="text-gray-500 hover:text-gray-300 text-[10px] leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
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
            propagation={propagation}
            onPatch={applyPatch}
          />
        )}
      </div>
    </div>
  )
}


// ── Global config section (editable) ──

function GlobalConfigSection({
  config, catalog, saving, propagation, onPatch,
}: {
  config: LoggingConfig
  catalog: DomainCatalog | null
  saving: boolean
  propagation: Map<string, ServiceLoggingResult>
  onPatch: (patch: LoggingConfigPatch) => void
}) {
  // Lifted from PropagationRow so DomainOverridesEdit can highlight rows
  // that drift on the currently-selected service.
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null)

  const driftedDomains = useMemo(() => {
    if (!selectedServiceKey) return EMPTY_SET
    const result = propagation.get(selectedServiceKey)
    if (result?.kind !== 'state') return EMPTY_SET
    const sd = result.state.domains
    const cd = config.log_domain_levels
    const all = new Set([...Object.keys(sd), ...Object.keys(cd)])
    const drifted = new Set<string>()
    for (const d of all) {
      if ((sd[d] ?? '').toUpperCase() !== (cd[d] ?? '').toUpperCase()) drifted.add(d)
    }
    return drifted
  }, [selectedServiceKey, propagation, config])

  const local = config.source === 'launcher-local'

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-1">
        Global Config <span className="font-normal lowercase text-gray-600">(applies to all services)</span>
      </div>

      {local && (
        <div className="rounded border border-amber-700/40 bg-amber-900/15 px-2 py-1.5 text-[10px] text-amber-300">
          Backend offline — showing the launcher-api process's own logging state.
          Edits apply to the launcher only and are <span className="font-semibold">not persisted</span>;
          DB level &amp; retention are backend-owned and unavailable here.
        </div>
      )}

      {/* Levels */}
      <div className="bg-surface-secondary rounded border border-border p-3 space-y-2">
        <Row label="Global Log Level" hint={local ? 'Launcher process only (not persisted)' : 'Minimum severity for all domains'}>
          <Select
            value={config.log_level}
            disabled={saving}
            onChange={(e) => onPatch({ log_level: e.target.value })}
            size="xs" width="auto" className="text-gray-200"
          >
            {LOG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Row>

        <Row label="DB Ingestion Level" hint={local ? 'Unavailable while backend is offline' : 'Minimum severity written to log database'}>
          <Select
            value={config.log_db_min_level}
            disabled={saving || local}
            onChange={(e) => onPatch({ log_db_min_level: e.target.value })}
            size="xs" width="auto" className="text-gray-200"
          >
            {local && <option value="">—</option>}
            {LOG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Row>

        <Row label="Retention" hint={local ? 'Unavailable while backend is offline' : 'Days to keep log entries (1–365)'}>
          <RetentionInput
            value={config.log_retention_days}
            saving={saving || local}
            onCommit={(days) => onPatch({ log_retention_days: days })}
          />
        </Row>
      </div>

      <PropagationRow
        config={config}
        propagation={propagation}
        selectedKey={selectedServiceKey}
        onSelect={setSelectedServiceKey}
      />

      {/* Domain overrides */}
      {catalog && catalog.groups.length > 0 && (
        <DomainOverridesEdit
          catalog={catalog}
          domainLevels={config.log_domain_levels}
          saving={saving}
          driftedDomains={driftedDomains}
          onUpdate={(levels) => onPatch({ log_domain_levels: levels })}
        />
      )}
    </div>
  )
}

const EMPTY_SET: ReadonlySet<string> = new Set()

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
      <div className="w-16">
        <Input
          size="xs"
          type="number"
          min={1}
          max={365}
          value={local}
          disabled={saving}
          onChange={(e) => setLocal(parseInt(e.target.value || '0', 10))}
          onBlur={() => { if (local !== value && local >= 1 && local <= 365) onCommit(local) }}
          className="text-right tabular-nums"
        />
      </div>
      <span className="text-[10px] text-gray-500">d</span>
    </div>
  )
}

function DomainOverridesEdit({
  catalog, domainLevels, saving, driftedDomains, onUpdate,
}: {
  catalog: DomainCatalog
  domainLevels: Record<string, string>
  saving: boolean
  driftedDomains: ReadonlySet<string>
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
                const isDrifted = driftedDomains.has(domain)
                return (
                  <div
                    key={domain}
                    className={`flex items-center justify-between px-3 py-1 border-t border-border/50 ${
                      isDrifted ? 'bg-amber-900/15' : ''
                    }`}
                  >
                    <span className={`text-[11px] ${isOverridden ? 'font-medium text-gray-200' : 'text-gray-500'}`}>
                      {domain}
                      {isDrifted && <span className="text-[9px] text-amber-400 ml-1">drift</span>}
                    </span>
                    <Select
                      value={current}
                      disabled={saving}
                      onChange={(e) => handleChange(domain, e.target.value)}
                      size="xs" width="auto"
                      className={`${
                        isDebug
                          ? 'border-blue-700 text-blue-400 font-medium'
                          : isOverridden
                            ? 'border-border text-gray-300'
                            : 'border-border text-gray-500'
                      }`}
                    >
                      <option value="">default</option>
                      {DOMAIN_LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </Select>
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
          <div className="px-3 py-1.5 border-t border-border/50 bg-surface/30 text-[9px] text-gray-600 leading-relaxed">
            Not all consumers expose live state. <span className="text-gray-500">Worker</span> reloads via Redis push (~1s) or 60s cron.
            {' '}<span className="text-gray-500">Browser</span> picks up changes on next reload.
          </div>
        </>
      )}
    </div>
  )
}


// ── Propagation row + per-service expanded view ──

type PropagationStatus = 'match' | 'mismatch' | 'unreachable'

function computeStatus(result: ServiceLoggingResult, config: LoggingConfig): PropagationStatus {
  if (result.kind !== 'state') return 'unreachable'
  const state = result.state
  if (state.level.toUpperCase() !== config.log_level.toUpperCase()) return 'mismatch'
  const sd = state.domains
  const cd = config.log_domain_levels
  const sk = Object.keys(sd)
  const ck = Object.keys(cd)
  if (sk.length !== ck.length) return 'mismatch'
  for (const k of sk) {
    if ((sd[k] ?? '').toUpperCase() !== (cd[k] ?? '').toUpperCase()) return 'mismatch'
  }
  return 'match'
}

function PropagationRow({
  config, propagation, selectedKey, onSelect,
}: {
  config: LoggingConfig
  propagation: Map<string, ServiceLoggingResult>
  selectedKey: string | null
  onSelect: (key: string | null) => void
}) {
  const entries = Array.from(propagation.entries())

  if (entries.length === 0) return null

  const expandedResult = selectedKey ? propagation.get(selectedKey) : null
  const expandedState = expandedResult?.kind === 'state' ? expandedResult.state : null

  return (
    <div className="bg-surface-secondary rounded border border-border overflow-hidden">
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[10px] text-gray-500">
          <span className="font-semibold uppercase tracking-wide">Propagation</span>
          <span className="ml-1 font-normal lowercase text-gray-600">
            global level applied to each running process — there is no per-service knob
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {entries.map(([key, result]) => (
            <PropagationBadge
              key={key}
              serviceKey={key}
              result={result}
              config={config}
              expanded={selectedKey === key}
              onToggle={() => onSelect(selectedKey === key ? null : key)}
            />
          ))}
        </div>
      </div>
      {selectedKey && expandedState && (
        <ServiceDiffView state={expandedState} config={config} />
      )}
      {selectedKey && !expandedState && (
        <div className="border-t border-border px-3 py-2 text-[10px] text-gray-500">
          Service unreachable — process may be down or hung. Check launcher logs.
        </div>
      )}
    </div>
  )
}

function PropagationBadge({
  serviceKey, result, config, expanded, onToggle,
}: {
  serviceKey: string
  result: ServiceLoggingResult
  config: LoggingConfig
  expanded: boolean
  onToggle: () => void
}) {
  const status = computeStatus(result, config)
  const level = result.kind === 'state' ? result.state.level : '—'

  const colors =
    status === 'match'
      ? 'border-emerald-700/60 text-emerald-400'
      : status === 'unreachable'
        ? 'border-red-700/60 text-red-400'
        : 'border-amber-700/60 text-amber-400'
  const icon = status === 'match' ? '✓' : status === 'unreachable' ? '✕' : '⏱'
  const tooltip =
    status === 'match'
      ? `${serviceKey}: in sync at ${level}`
      : status === 'unreachable'
        ? `${serviceKey}: unreachable`
        : `${serviceKey}: out of sync (service ${level} vs global ${config.log_level})`

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tooltip}
      className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border bg-surface tabular-nums ${colors} ${expanded ? 'ring-1 ring-blue-500' : 'hover:brightness-125'}`}
    >
      <span className="font-medium">{serviceKey}</span>
      <span>{icon}</span>
      <span className="text-gray-400">{level}</span>
    </button>
  )
}

/**
 * Service-specific expanded view for a propagation badge.
 *
 * Only shows what's actually relevant to *this* service:
 *   - Level diff vs global config (if any).
 *   - Per-domain drift: domains where this service's effective level
 *     differs from the global config's value. In-sync domains are hidden
 *     (they'd just mirror the Domain Levels section above).
 *   - Active domains: which categories this service has actually emitted
 *     log lines on. Useful sanity-check that domains are wired correctly
 *     even when fully in sync.
 */
function ServiceDiffView({
  state, config,
}: {
  state: LoggingState
  config: LoggingConfig
}) {
  const stateLevel = state.level.toUpperCase()
  const globalLevel = config.log_level.toUpperCase()
  const levelDrift = stateLevel !== globalLevel

  const sd = state.domains
  const cd = config.log_domain_levels
  const allDomains = new Set([...Object.keys(sd), ...Object.keys(cd)])
  const drift: { domain: string; service: string; global: string }[] = []
  for (const d of allDomains) {
    const sv = (sd[d] ?? '').toUpperCase()
    const gv = (cd[d] ?? '').toUpperCase()
    if (sv !== gv) {
      drift.push({ domain: d, service: sd[d] || 'default', global: cd[d] || 'default' })
    }
  }

  const active = state.active_domains ?? []
  const inSync = !levelDrift && drift.length === 0

  return (
    <div className="border-t border-border px-3 py-2 space-y-2 text-[10px]">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 uppercase tracking-wide font-semibold">Level</span>
        <span className={levelDrift ? 'text-amber-400 font-medium' : 'text-emerald-400'}>{state.level}</span>
        {levelDrift ? (
          <span className="text-gray-500">
            ≠ <span className="text-gray-300">{config.log_level}</span> global — not yet propagated
          </span>
        ) : (
          <span className="text-gray-600">inherited from global</span>
        )}
      </div>

      {drift.length > 0 && (
        <div>
          <div className="text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
            Domain drift ({drift.length})
          </div>
          <div className="space-y-0.5">
            {drift.map((d) => (
              <div
                key={d.domain}
                className="flex items-center justify-between rounded bg-amber-900/10 border border-amber-700/30 px-2 py-0.5"
              >
                <span className="text-gray-300">{d.domain}</span>
                <span className="tabular-nums">
                  <span className="text-amber-400">{d.service}</span>
                  <span className="text-gray-500"> ≠ </span>
                  <span className="text-gray-400">{d.global}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-gray-500 uppercase tracking-wide font-semibold mb-0.5">
          Active domains ({active.length})
        </div>
        {active.length === 0 ? (
          <div className="text-gray-600">No domain activity yet on this service.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {active.map((d) => (
              <span
                key={d}
                className="px-1.5 py-0.5 rounded bg-surface border border-border/50 text-gray-300 tabular-nums"
              >
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      {inSync && active.length === 0 && (
        <div className="text-gray-600">In sync with global config.</div>
      )}
    </div>
  )
}
