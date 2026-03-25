/**
 * Trace Panel — shows the full journey of a request_id or job_id.
 * Queries the backend's trace endpoints for cross-service log entries.
 */

import { useState, useEffect } from 'react'
import { getRequestTrace, getJobTrace, logEntryToLine, type LogEntry } from '../api/dbLogs'
import { getLogMeta, getCompiledFields, type LogMeta, type CompiledField } from '../api/logMeta'
import { LogLine } from './log'

interface TracePanelProps {
  fieldName: string
  fieldValue: string
  onClose: () => void
}

export function TracePanel({ fieldName, fieldValue, onClose }: TracePanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<LogMeta | null>(null)
  const [fields, setFields] = useState<CompiledField[]>([])

  useEffect(() => {
    getLogMeta().then(setMeta)
    getCompiledFields().then(setFields)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setEntries([])

    const fetch = async () => {
      try {
        let result: LogEntry[]
        if (fieldName === 'job_id') {
          result = await getJobTrace(Number(fieldValue))
        } else if (fieldName === 'request_id') {
          result = await getRequestTrace(fieldValue)
        } else {
          // Fallback: search by field=value
          const { queryDbLogs } = await import('../api/dbLogs')
          const res = await queryDbLogs({ search: `${fieldName}=${fieldValue}`, limit: 100, minutes: 1440 })
          result = res.items
        }
        setEntries(result)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [fieldName, fieldValue])

  const prefixMap: Record<string, string> = {
    request_id: 'req', job_id: 'job', provider_id: 'provider',
    generation_id: 'gen', user_id: 'user',
  }
  const prefix = prefixMap[fieldName] ?? fieldName

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gray-400">Trace</div>
          <div className="text-xs font-mono text-blue-400 truncate" title={fieldValue}>
            {prefix}:{fieldValue}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none px-1">×</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-surface">
        {loading && (
          <div className="text-gray-500 text-[11px] px-3 py-4 text-center">
            Tracing {prefix}:{fieldValue}...
          </div>
        )}
        {error && (
          <div className="text-red-400 text-[11px] px-3 py-2">
            {error.includes('Failed') ? 'Backend not reachable — is it running?' : error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="text-gray-500 text-[11px] px-3 py-4 text-center">
            No trace entries found
          </div>
        )}
        {entries.map((entry) => (
          <LogLine
            key={entry.id}
            line={logEntryToLine(entry)}
            meta={meta}
            fields={fields}
          />
        ))}
      </div>

      {/* Footer */}
      {!loading && entries.length > 0 && (
        <div className="px-3 py-1 border-t border-border text-[10px] text-gray-500 shrink-0">
          {entries.length} entries across {new Set(entries.map((e) => e.service)).size} service(s)
        </div>
      )}
    </div>
  )
}
