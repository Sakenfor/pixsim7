/**
 * Database Log Viewer — queries structured logs from the backend API.
 *
 * All filter options and presets are fetched from /logs/meta (pixsim_logging).
 * Reuses the shared LogLine component for consistent rendering.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { queryDbLogs, logEntryToLine, type LogEntry, type LogQueryParams } from '../api/dbLogs'
import {
  getLogMeta, getCompiledFields,
  type LogMeta, type CompiledField, type FilterPreset,
} from '../api/logMeta'
import { LogLine, matchesSearch } from './log'

export function DbLogViewer({ onFieldClick }: { onFieldClick?: (name: string, value: string) => void }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<LogMeta | null>(null)
  const [fields, setFields] = useState<CompiledField[]>([])

  // Filters — initialized from meta once loaded
  const [level, setLevel] = useState('')
  const [service, setService] = useState('')
  const [search, setSearch] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [limit, setLimit] = useState(500)
  const [autoRefresh, setAutoRefresh] = useState(0)
  const [activePreset, setActivePreset] = useState<string>('')

  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    getLogMeta().then(setMeta)
    getCompiledFields().then(setFields)
  }, [])

  const filters = meta?.filters

  // Apply preset
  const applyPreset = useCallback((presetId: string) => {
    setActivePreset(presetId)
    if (!presetId || !filters) return
    const preset = filters.presets.find((p) => p.id === presetId)
    if (!preset) return
    const af = preset.api_filters
    setLevel((af.level as string) ?? '')
    setService((af.service as string) ?? '')
    setSearch('')
    setMinutes((af.time_range as number) ?? 15)
    setLimit((af.limit as number) ?? 250)
  }, [filters])

  const clearPreset = useCallback(() => {
    setActivePreset('')
    setLevel('')
    setService('')
    setSearch('')
    setMinutes(30)
    setLimit(500)
  }, [])

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: LogQueryParams = { limit }
      if (level) params.level = level
      if (service) params.service = service
      // Only send plain search to backend; operator searches (| !) are applied client-side
      const hasOperators = search.includes('|') || search.includes('!')
      if (search && !hasOperators) params.search = search
      if (minutes > 0) params.minutes = minutes
      const res = await queryDbLogs(params)

      let items = res.items

      // Client-side preset filtering
      if (activePreset && filters) {
        const preset = filters.presets.find((p) => p.id === activePreset)
        if (preset) {
          items = applyClientFilters(items, preset)
        }
      }

      setEntries(items)
      setTotal(res.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [level, service, search, minutes, limit, activePreset, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Auto-refresh
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    if (autoRefresh > 0) {
      refreshRef.current = setInterval(fetchLogs, autoRefresh)
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [autoRefresh, fetchLogs])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [entries.length, search])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Client-side operator search (| !) on rendered lines
  const displayEntries = useMemo(() => {
    const hasOperators = search.includes('|') || search.includes('!')
    if (!hasOperators || !search) return entries
    return entries.filter((e) => matchesSearch(logEntryToLine(e), search))
  }, [entries, search])

  const sel = "bg-surface-secondary border border-border rounded px-1.5 py-0.5 text-gray-300 text-[11px] focus:border-blue-500 outline-none"

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface text-gray-100">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-border shrink-0">
        <button onClick={fetchLogs} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover mr-0.5" title="Refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
        </button>

        {/* Presets dropdown */}
        {filters && filters.presets.length > 0 && (
          <select
            value={activePreset}
            onChange={(e) => e.target.value ? applyPreset(e.target.value) : clearPreset()}
            className={sel}
            title="Filter presets"
          >
            <option value="">Presets...</option>
            {filters.presets.map((p) => (
              <option key={p.id} value={p.id} title={p.description}>{p.label}</option>
            ))}
          </select>
        )}

        <select value={level} onChange={(e) => setLevel(e.target.value)} className={sel}>
          {(filters?.level_options ?? ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG']).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </select>

        <select value={service} onChange={(e) => setService(e.target.value)} className={sel}>
          {(filters?.service_options ?? ['', 'api', 'worker']).map((s) => (
            <option key={s} value={s}>{s || 'All services'}</option>
          ))}
        </select>

        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter…  a | b  for OR" className={`${sel} w-40`}
        />

        <div className="flex items-center gap-0.5 text-[10px]">
          {(filters?.time_range_options ?? [{ value: 15, label: '15m' }, { value: 30, label: '30m' }, { value: 60, label: '1h' }, { value: 0, label: 'All' }]).map((t) => (
            <button
              key={t.value} onClick={() => setMinutes(t.value)}
              className={`px-1.5 py-0.5 rounded ${minutes === t.value ? 'bg-blue-600 text-white' : 'bg-surface-tertiary text-gray-400 hover:bg-surface-hover'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={sel}>
          {(filters?.limit_options ?? [100, 250, 500, 1000]).map((l) => (
            <option key={l} value={l}>{l} rows</option>
          ))}
        </select>

        <select value={autoRefresh} onChange={(e) => setAutoRefresh(Number(e.target.value))} className={sel}>
          {(filters?.auto_refresh_options ?? [{ value: 0, label: 'Off' }, { value: 5000, label: '5s' }]).map((r) => (
            <option key={r.value} value={r.value}>Refresh: {r.label}</option>
          ))}
        </select>

        <div className="flex-1" />
        <span className="text-[10px] text-gray-500">{displayEntries.length}{displayEntries.length !== entries.length ? `/${entries.length}` : ''}/{total} {loading && '...'}</span>
      </div>

      {error && (
        <div className="px-3 py-1 bg-red-900/30 text-red-400 text-[11px] border-b border-red-800/30 select-text whitespace-pre-wrap break-words">{error}</div>
      )}

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface">
        {displayEntries.length === 0 && !loading && (
          <div className="text-gray-500 text-sm text-center py-8">
            {error ? 'Failed to load — is the backend running?' : 'No logs match the current filters'}
          </div>
        )}
        {displayEntries.map((entry) => (
          <LogLine key={entry.id} line={logEntryToLine(entry)} meta={meta} fields={fields}
            onFieldClick={(name, value) => {
              const traceableFields = new Set(['request_id', 'job_id', 'provider_id', 'generation_id', 'user_id', 'submission_id'])
              if (traceableFields.has(name) && onFieldClick) {
                onFieldClick(name, value)
              } else {
                setSearch(`${name}=${value}`)
              }
            }} />
        ))}
      </div>
    </div>
  )
}

// ── Client-side preset filtering ──

function applyClientFilters(entries: LogEntry[], preset: FilterPreset): LogEntry[] {
  const inc = preset.include_patterns
  const exc = preset.exclude_patterns
  if (!inc.length && !exc.length) return entries

  return entries.filter((e) => {
    const text = [e.msg, e.stage, e.error, e.error_type, e.provider_id, e.operation_type]
      .filter(Boolean).join(' ').toLowerCase()

    if (exc.length && exc.some((p) => text.includes(p.toLowerCase()))) return false
    if (inc.length && !inc.some((p) => text.includes(p.toLowerCase()))) return false
    return true
  })
}
