import { useEffect, useRef, useState } from 'react'
import { useLogsStore } from '../stores/logs'
import { useServicesStore } from '../stores/services'
import { getLogMeta, getCompiledFields, type LogMeta, type CompiledField } from '../api/logMeta'
import { LogLine } from './log'

export function LogViewer() {
  const selectedKey = useServicesStore((s) => s.selectedKey)
  const services = useServicesStore((s) => s.services)
  const { lines, loading, fetchLogs, clearLogs } = useLogsStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  const [meta, setMeta] = useState<LogMeta | null>(null)
  const [fields, setFields] = useState<CompiledField[]>([])

  useEffect(() => {
    getLogMeta().then(setMeta)
    getCompiledFields().then(setFields)
  }, [])

  useEffect(() => {
    if (selectedKey) fetchLogs(selectedKey)
  }, [selectedKey])

  useEffect(() => {
    if (autoScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [lines.length])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const title = services.find((s) => s.key === selectedKey)?.title ?? selectedKey

  if (!selectedKey) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Select a service to view logs</div>
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        <span className="text-gray-400 font-medium">{title}</span>
        <span className="text-gray-600">{lines.length} lines</span>
        <div className="flex-1" />
        <button onClick={() => selectedKey && fetchLogs(selectedKey)} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300 transition-colors">Refresh</button>
        <button onClick={() => selectedKey && clearLogs(selectedKey)} className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-hover text-gray-300 transition-colors">Clear</button>
      </div>
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface">
        {loading && lines.length === 0 && <div className="text-gray-500 py-4 px-3">Loading logs...</div>}
        {lines.map((line, i) => (
          <LogLine key={i} line={line} meta={meta} fields={fields} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
