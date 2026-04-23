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
import { LogLine, matchesSearch } from './log'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

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
      if (!matchesSearch(line, searchFilter)) return false
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
        <div className="flex items-center gap-0.5 mr-1">
          <button onClick={() => setPaused(!paused)} className={`p-1 rounded ${paused ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-hover'}`} title={paused ? 'Resume' : 'Pause'}>
            {paused
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6,4 20,12 6,20" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="4" width="4" height="16" /><rect x="15" y="4" width="4" height="16" /></svg>}
          </button>
          <button onClick={fetchLogs} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
          </button>
          <button onClick={() => { clearLogs(serviceKey); setLines([]) }} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" /></svg>
          </button>
        </div>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={sel}>
          {(filters?.level_options ?? ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG']).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </select>

        <input
          type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter…  a | b  for OR" className={`${sel} w-36`}
        />

        <div className="flex-1" />
        <span className="text-gray-600">{filteredLines.length}{filteredLines.length !== lines.length ? `/${lines.length}` : ''} lines</span>
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
