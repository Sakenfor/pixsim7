/**
 * Standalone log viewer for embedding in PySide6 QWebEngineView.
 *
 * URL: /viewer#serviceKey
 * Listens for hash changes + postMessage({ type: 'selectService', key: '...' }).
 * Filters fetched from /logs/meta (pixsim_logging).
 */

import { useEffect, useState, useCallback } from 'react'
import { getLogs, clearLogs } from '../api/client'
import { getLogMeta, getCompiledFields, type LogMeta, type CompiledField } from '../api/logMeta'
import { Input, Select } from '@pixsim7/shared.ui'
import { matchesSearch, LogControlButtons, VirtualLogList, LEVEL_OPTIONS } from './log'
import { usePollWhenVisible } from '../hooks/usePollWhenVisible'

const MAX_LINES = 2000
const POLL_INTERVAL = 2000

export function EmbeddedLogViewer() {
  const [serviceKey, setServiceKey] = useState(() => location.hash.slice(1) || '')
  const [lines, setLines] = useState<string[]>([])
  const [meta, setMeta] = useState<LogMeta | null>(null)
  const [fields, setFields] = useState<CompiledField[]>([])
  const [levelFilter, setLevelFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const onHash = () => setServiceKey(location.hash.slice(1))
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'selectService' && e.data.key) setServiceKey(e.data.key)
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('message', onMessage) }
  }, [])

  useEffect(() => {
    getLogMeta().then(setMeta)
    getCompiledFields().then(setFields)
  }, [])

  const fetchLogs = useCallback(async () => {
    if (!serviceKey || paused) return
    try {
      const res = await getLogs(serviceKey, 500)
      setLines(res.lines.slice(-MAX_LINES))
    } catch {}
  }, [serviceKey, paused])

  // Reset lines only on service switch, not on pause toggle
  useEffect(() => {
    setLines([])
    fetchLogs()
  }, [serviceKey])

  // Polling: pauses automatically when window is hidden
  usePollWhenVisible(fetchLogs, POLL_INTERVAL, !paused && !!serviceKey)

  // Client-side filtering
  const filteredLines = lines.filter((line) => {
    if (levelFilter) {
      const upper = line.toUpperCase()
      if (!upper.includes(levelFilter)) return false
    }
    if (searchFilter) {
      if (!matchesSearch(line, searchFilter)) return false
    }
    return true
  })

  const filters = meta?.filters

  if (!serviceKey) {
    return <div className="h-screen flex items-center justify-center bg-surface text-gray-500 text-sm">No service selected</div>
  }

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      {/* Toolbar with filters */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border text-[11px] shrink-0">
        <LogControlButtons
          paused={paused}
          onTogglePause={() => setPaused(!paused)}
          onRefresh={fetchLogs}
          onClear={() => { clearLogs(serviceKey); setLines([]) }}
        />

        <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} size="xs" width="auto" className="text-gray-100">
          {(filters?.level_options ?? LEVEL_OPTIONS).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </Select>

        <div className="w-36"><Input size="xs" className="text-gray-100"
          type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter…  a | b  for OR" /></div>

        <div className="flex-1" />
        <span className="text-gray-600">{filteredLines.length}{filteredLines.length !== lines.length ? `/${lines.length}` : ''} lines</span>
      </div>

      {/* Log lines (virtualized — keeps live DOM bounded) */}
      <div className="flex-1 min-h-0 bg-surface">
        <VirtualLogList
          lines={filteredLines}
          meta={meta}
          fields={fields}
          onFieldClick={(name, value) => setSearchFilter(`${name}=${value}`)}
        />
      </div>
    </div>
  )
}
