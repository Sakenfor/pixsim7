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
import { Input, Select } from '@pixsim7/shared.ui'
import { matchesSearch, routeFieldClick, VirtualLogList, LEVEL_OPTIONS } from './log'
import { Refresh } from './icons'

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
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [limit, setLimit] = useState(500)
  const [autoRefresh, setAutoRefresh] = useState(0)
  const [activePreset, setActivePreset] = useState<string>('')

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
    setChannel((af.channel as string) ?? '')
    setSearch('')
    setMinutes((af.time_range as number) ?? 15)
    setLimit((af.limit as number) ?? 250)
  }, [filters])

  const clearPreset = useCallback(() => {
    setActivePreset('')
    setLevel('')
    setService('')
    setChannel('')
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
      if (channel) params.channel = channel
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
  }, [level, service, channel, search, minutes, limit, activePreset, filters])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Auto-refresh
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    if (autoRefresh > 0) {
      refreshRef.current = setInterval(fetchLogs, autoRefresh)
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [autoRefresh, fetchLogs])

  // Client-side operator search (| !) on rendered lines
  const displayEntries = useMemo(() => {
    const hasOperators = search.includes('|') || search.includes('!')
    if (!hasOperators || !search) return entries
    return entries.filter((e) => matchesSearch(logEntryToLine(e), search))
  }, [entries, search])

  const displayLines = useMemo(() => displayEntries.map(logEntryToLine), [displayEntries])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface text-gray-100">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-border shrink-0">
        <button onClick={fetchLogs} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover mr-0.5" title="Refresh">
          <Refresh size={12} />
        </button>

        {/* Presets dropdown */}
        {filters && filters.presets.length > 0 && (
          <Select
            value={activePreset}
            onChange={(e) => e.target.value ? applyPreset(e.target.value) : clearPreset()}
            size="xs" width="auto" className="text-gray-100"
            title="Filter presets"
          >
            <option value="">Presets...</option>
            {filters.presets.map((p) => (
              <option key={p.id} value={p.id} title={p.description}>{p.label}</option>
            ))}
          </Select>
        )}

        <Select value={level} onChange={(e) => setLevel(e.target.value)} size="xs" width="auto" className="text-gray-100">
          {(filters?.level_options ?? LEVEL_OPTIONS).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </Select>

        <Select value={service} onChange={(e) => setService(e.target.value)} size="xs" width="auto" className="text-gray-100">
          {(filters?.service_options ?? ['', 'api', 'worker']).map((s) => (
            <option key={s} value={s}>{s || 'All services'}</option>
          ))}
        </Select>

        <div className="w-40"><Input size="xs" className="text-gray-100"
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter…  a | b  for OR" /></div>

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

        <Select value={limit} onChange={(e) => setLimit(Number(e.target.value))} size="xs" width="auto" className="text-gray-100">
          {(filters?.limit_options ?? [100, 250, 500, 1000]).map((l) => (
            <option key={l} value={l}>{l} rows</option>
          ))}
        </Select>

        <Select value={autoRefresh} onChange={(e) => setAutoRefresh(Number(e.target.value))} size="xs" width="auto" className="text-gray-100">
          {(filters?.auto_refresh_options ?? [{ value: 0, label: 'Off' }, { value: 5000, label: '5s' }]).map((r) => (
            <option key={r.value} value={r.value}>Refresh: {r.label}</option>
          ))}
        </Select>

        <div className="flex-1" />
        <span className="text-[10px] text-gray-500">{displayEntries.length}{displayEntries.length !== entries.length ? `/${entries.length}` : ''}/{total} {loading && '...'}</span>
      </div>

      {error && (
        <div className="px-3 py-1 bg-red-900/30 text-red-400 text-[11px] border-b border-red-800/30 select-text whitespace-pre-wrap break-words">{error}</div>
      )}

      <div className="flex-1 min-h-0 bg-surface">
        {displayLines.length === 0 && !loading ? (
          <div className="text-gray-500 text-sm text-center py-8">
            {error ? 'Failed to load — is the backend running?' : 'No logs match the current filters'}
          </div>
        ) : (
          <VirtualLogList
            lines={displayLines}
            meta={meta}
            fields={fields}
            onFieldClick={(name, value) => routeFieldClick(name, value, setSearch, onFieldClick)}
          />
        )}
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
