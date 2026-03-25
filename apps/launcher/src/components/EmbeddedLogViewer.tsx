/**
 * Standalone log viewer for embedding in PySide6 QWebEngineView.
 *
 * URL: /viewer#serviceKey
 * Listens for hash changes + postMessage({ type: 'selectService', key: '...' }).
 * Filters fetched from /logs/meta (pixsim_logging).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { getLogs, clearLogs } from '../api/client'
import { getLogMeta, getCompiledFields, type LogMeta, type CompiledField } from '../api/logMeta'
import { LogLine } from './log'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Polling: start/stop based on pause state
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (!paused) {
      fetchLogs()
      pollRef.current = setInterval(fetchLogs, POLL_INTERVAL)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [paused, fetchLogs])

  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Client-side filtering
  const filteredLines = lines.filter((line) => {
    if (levelFilter) {
      const upper = line.toUpperCase()
      if (!upper.includes(levelFilter)) return false
    }
    if (searchFilter) {
      if (!line.toLowerCase().includes(searchFilter.toLowerCase())) return false
    }
    return true
  })

  const filters = meta?.filters
  const sel = "bg-surface-secondary border border-border rounded px-1.5 py-0.5 text-gray-300 text-[11px] focus:border-blue-500 outline-none"

  if (!serviceKey) {
    return <div className="h-screen flex items-center justify-center bg-surface text-gray-500 text-sm">No service selected</div>
  }

  return (
    <div className="h-screen flex flex-col bg-surface text-gray-100">
      {/* Toolbar with filters */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border text-[11px] shrink-0">
        <span className="text-gray-400 font-medium mr-1">{serviceKey}</span>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={sel}>
          {(filters?.level_options ?? ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG']).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </select>

        <input
          type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search..." className={`${sel} w-32`}
        />

        <button
          onClick={() => setPaused(!paused)}
          className={`px-2 py-0.5 rounded text-[11px] ${paused ? 'bg-amber-600 text-white' : 'bg-surface-tertiary text-gray-300 hover:bg-surface-hover'}`}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <div className="flex-1" />
        <span className="text-gray-600">{filteredLines.length}{filteredLines.length !== lines.length ? `/${lines.length}` : ''} lines</span>
        <button onClick={fetchLogs} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300">Refresh</button>
        <button onClick={() => { clearLogs(serviceKey); setLines([]) }} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300">Clear</button>
      </div>

      {/* Log lines */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface">
        {filteredLines.map((line, i) => (
          <LogLine key={i} line={line} meta={meta} fields={fields}
            onFieldClick={(name, value) => setSearchFilter(`${name}=${value}`)} />
        ))}
      </div>
    </div>
  )
}
