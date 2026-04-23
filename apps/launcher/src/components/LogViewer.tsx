import { useEffect, useState, useCallback, useMemo } from 'react'
import { useLogsStore } from '../stores/logs'
import { useServicesStore } from '../stores/services'
import { getLogMeta, getCompiledFields, parseLine, type LogMeta, type CompiledField } from '../api/logMeta'
import { VirtualLogList, matchesSearch } from './log'
import { usePollWhenVisible } from '../hooks/usePollWhenVisible'

const POLL_INTERVAL = 2000

/** Regex to suppress known noisy log lines (Docker/Redis save cycles, PG checkpoints). */
const NOISE_RE = /Background saving (?:started|terminated)|DB saved on disk|Fork CoW for RDB|changes in \d+ seconds\. Saving|checkpoint starting: time|checkpoint complete:/

/** Extract unique event names and domains from log lines (for dynamic filter dropdowns). */
// ARQ timing prefix: "1.02s → cron:task()" or "0.01s ← cron:task ●"
const ARQ_EVENT_RE = /[\d.]+s\s*[→←]\s*(\S+)/

function extractEventName(message: string): string | null {
  // Try ARQ format first: "1.02s → cron:run_automation_loops()"
  const arqMatch = ARQ_EVENT_RE.exec(message)
  if (arqMatch) return arqMatch[1].replace(/[()]+$/, '') // strip trailing ()

  // Standard: first word (skip if looks like a number/timing)
  const first = message.split(/\s/)[0]
  if (!first || first.length < 3 || first.length > 40) return null
  if (first.includes('=')) return null
  if (/^\d/.test(first)) return null  // skip "1.02s", "127.0.0.1", etc.
  return first
}

function discoverFilters(lines: string[]) {
  const eventCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const sample = lines.length > 300 ? lines.slice(-300) : lines
  for (const line of sample) {
    const parsed = parseLine(line)
    if (parsed.message) {
      const ev = extractEventName(parsed.message)
      if (ev) eventCounts.set(ev, (eventCounts.get(ev) ?? 0) + 1)
    }
    if (parsed.fields.domain) {
      const d = parsed.fields.domain
      domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1)
    }
  }
  // Only show events/domains that appear more than once (skip one-off startup noise)
  const events = [...eventCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])  // most frequent first
    .map(([ev]) => ev)
  const domains = [...domainCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d)
  return { events, domains }
}

export function LogViewer({ onFieldClick }: { onFieldClick?: (name: string, value: string) => void }) {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const { lines, loading, fetchLogs, clearLogs } = useLogsStore()

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

  const pollFn = useCallback(() => {
    if (selectedKey) fetchLogs(selectedKey)
  }, [selectedKey, fetchLogs])
  usePollWhenVisible(pollFn, POLL_INTERVAL, !paused && !!selectedKey)

  // Discover dynamic filter options from current log lines
  const discovered = useMemo(() => discoverFilters(lines), [lines])

  // Client-side filtering
  const filteredLines = useMemo(() => lines.filter((line) => {
    // Suppress known Docker/Redis noise
    if (NOISE_RE.test(line)) return false
    if (levelFilter && !line.toUpperCase().includes(levelFilter)) return false
    if (searchFilter && !matchesSearch(line, searchFilter)) return false
    if (eventFilter) {
      const parsed = parseLine(line)
      const ev = extractEventName(parsed.message ?? '')
      if (ev !== eventFilter) return false
    }
    if (domainFilter && !line.includes(`domain=${domainFilter}`)) return false
    return true
  }), [lines, levelFilter, searchFilter, eventFilter, domainFilter])

  const filters = meta?.filters
  const sel = "bg-surface-secondary border border-border rounded px-1.5 py-0.5 text-gray-300 text-[11px] focus:border-blue-500 outline-none"

  if (!selectedKey) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a service to view logs</div>
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border text-[11px] shrink-0 flex-wrap">
        <div className="flex items-center gap-0.5 mr-1">
          <button onClick={() => setPaused(!paused)} className={`p-1 rounded ${paused ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-hover'}`} title={paused ? 'Resume' : 'Pause'}>
            {paused
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6,4 20,12 6,20" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="4" width="4" height="16" /><rect x="15" y="4" width="4" height="16" /></svg>}
          </button>
          <button onClick={() => selectedKey && fetchLogs(selectedKey)} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
          </button>
          <button onClick={() => selectedKey && clearLogs(selectedKey)} className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-hover" title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6" /></svg>
          </button>
        </div>

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
          placeholder="Filter…  a | b  for OR" className={`${sel} w-36`}
        />

        <div className="flex-1" />
        <span className="text-gray-600">{filteredLines.length}{filteredLines.length !== lines.length ? `/${lines.length}` : ''} lines</span>
      </div>

      {/* Log lines (virtualized) */}
      <div className="flex-1 bg-surface min-h-0 overflow-hidden">
        {loading && filteredLines.length === 0 && lines.length === 0 && <div className="text-gray-500 py-4 px-3">Loading logs...</div>}
        {!loading && filteredLines.length === 0 && lines.length === 0 && <div className="text-gray-600 py-4 px-3">No logs yet</div>}
        {filteredLines.length > 0 && (
          <VirtualLogList
            lines={filteredLines}
            meta={meta}
            fields={fields}
            onFieldClick={(name, value) => {
              // Traceable fields (request_id, job_id, etc.) → open trace panel
              const traceableFields = new Set(['request_id', 'job_id', 'provider_id', 'generation_id', 'user_id', 'submission_id'])
              if (traceableFields.has(name) && onFieldClick) {
                onFieldClick(name, value)
              } else {
                // Other fields → filter in search
                setSearchFilter(`${name}=${value}`)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
