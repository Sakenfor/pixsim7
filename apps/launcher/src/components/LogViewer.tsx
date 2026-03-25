import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useLogsStore } from '../stores/logs'
import { useServicesStore } from '../stores/services'
import { getLogMeta, getCompiledFields, parseLine, type LogMeta, type CompiledField } from '../api/logMeta'
import { LogLine } from './log'

const POLL_INTERVAL = 2000

/** Extract unique event names and domains from log lines (for dynamic filter dropdowns). */
function discoverFilters(lines: string[]) {
  const events = new Set<string>()
  const domains = new Set<string>()
  // Sample last 300 lines for performance
  const sample = lines.length > 300 ? lines.slice(-300) : lines
  for (const line of sample) {
    const parsed = parseLine(line)
    // Event: first word of message (before space or key=value)
    if (parsed.message) {
      const ev = parsed.message.split(/\s/)[0]
      if (ev && ev.length > 2 && ev.length < 40 && !ev.includes('=')) {
        events.add(ev)
      }
    }
    if (parsed.fields.domain) domains.add(parsed.fields.domain)
  }
  return {
    events: [...events].sort(),
    domains: [...domains].sort(),
  }
}

export function LogViewer() {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const services = useServicesStore((s) => s.services)
  const { lines, loading, fetchLogs, clearLogs } = useLogsStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [meta, setMeta] = useState<LogMeta | null>(null)
  const [fields, setFields] = useState<CompiledField[]>([])
  const [levelFilter, setLevelFilter] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [domainFilter, setDomainFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    getLogMeta().then(setMeta)
    getCompiledFields().then(setFields)
  }, [])

  useEffect(() => {
    if (selectedKey) fetchLogs(selectedKey)
  }, [selectedKey])

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (!paused && selectedKey) {
      pollRef.current = setInterval(() => fetchLogs(selectedKey), POLL_INTERVAL)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [paused, selectedKey])

  useEffect(() => {
    if (autoScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [lines.length])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Discover dynamic filter options from current log lines
  const discovered = useMemo(() => discoverFilters(lines), [lines])

  // Client-side filtering
  const filteredLines = useMemo(() => lines.filter((line) => {
    if (levelFilter && !line.toUpperCase().includes(levelFilter)) return false
    if (searchFilter && !line.toLowerCase().includes(searchFilter.toLowerCase())) return false
    if (eventFilter) {
      const parsed = parseLine(line)
      const ev = parsed.message?.split(/\s/)[0] ?? ''
      if (ev !== eventFilter) return false
    }
    if (domainFilter && !line.includes(`domain=${domainFilter}`)) return false
    return true
  }), [lines, levelFilter, searchFilter, eventFilter, domainFilter])

  const title = services.find((s) => s.key === selectedKey)?.title ?? selectedKey
  const filters = meta?.filters
  const sel = "bg-surface-secondary border border-border rounded px-1.5 py-0.5 text-gray-300 text-[11px] focus:border-blue-500 outline-none"

  if (!selectedKey) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a service to view logs</div>
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filter toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border text-[11px] shrink-0 flex-wrap">
        <span className="text-gray-400 font-medium mr-1">{title}</span>

        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={sel}>
          {(filters?.level_options ?? ['', 'ERROR', 'WARNING', 'INFO', 'DEBUG']).map((l) => (
            <option key={l} value={l}>{l || 'All levels'}</option>
          ))}
        </select>

        {discovered.events.length > 0 && (
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={sel}>
            <option value="">All events</option>
            {discovered.events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        )}

        {discovered.domains.length > 0 && (
          <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className={sel}>
            <option value="">All domains</option>
            {discovered.domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

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
        <button onClick={() => selectedKey && fetchLogs(selectedKey)} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300">Refresh</button>
        <button onClick={() => selectedKey && clearLogs(selectedKey)} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300">Clear</button>
      </div>

      {/* Log lines */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface">
        {loading && lines.length === 0 && <div className="text-gray-500 py-4 px-3">Loading logs...</div>}
        {filteredLines.map((line, i) => (
          <LogLine key={i} line={line} meta={meta} fields={fields}
            onFieldClick={(name, value) => setSearchFilter(`${name}=${value}`)} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
