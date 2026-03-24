/**
 * Rich log line renderer — shared between dashboard and embedded viewer.
 *
 * Features:
 * - Parsed timestamp with relative time tooltip
 * - Level badge with registry colors
 * - Service badge with registry colors
 * - Structured key=value field highlighting
 * - Clickable ID fields with prefix + truncation
 * - HTTP method/path/status rendering
 * - Error highlighting
 * - Expandable detail panel (click row to toggle)
 */

import { useState, useMemo } from 'react'
import type { LogMeta, CompiledField, ClickableFieldMeta, ParsedLine } from '../../api/logMeta'
import { parseLine, relativeTime, httpStatusColor } from '../../api/logMeta'

interface LogLineProps {
  line: string
  meta: LogMeta | null
  fields: CompiledField[]
}

export function LogLine({ line, meta, fields }: LogLineProps) {
  const [expanded, setExpanded] = useState(false)
  const parsed = useMemo(() => parseLine(line), [line])
  const levelStyle = meta?.level_colors[parsed.level]
  const serviceColor = parsed.service
    ? (meta?.service_colors[parsed.service] ?? '#B0BEC5')
    : null
  const hasDetails = Object.keys(parsed.fields).length > 0

  return (
    <div
      className={`group border-l-2 hover:bg-white/[0.04] ${expanded ? 'bg-blue-500/[0.06]' : ''}`}
      style={{ borderColor: levelStyle?.color ?? '#555' }}
    >
      {/* Main row */}
      <div
        className={`flex items-baseline gap-1.5 px-2 py-px font-mono text-[11px] leading-[1.55] ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Expand icon */}
        {hasDetails && (
          <span className="text-gray-600 text-[9px] w-3 shrink-0 select-none">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!hasDetails && <span className="w-3 shrink-0" />}

        {/* Timestamp */}
        <Timestamp value={parsed.timestamp} raw={parsed.raw} />

        {/* Level badge */}
        <LevelBadge level={parsed.level} color={levelStyle?.color} />

        {/* Service badge */}
        {parsed.service && (
          <span
            className="shrink-0 w-[70px] truncate text-[10px]"
            style={{ color: serviceColor ?? '#B0BEC5' }}
          >
            {parsed.service}
          </span>
        )}

        {/* Message with inline field highlights */}
        <MessageContent
          message={parsed.message}
          fields={fields}
          meta={meta}
          parsedFields={parsed.fields}
        />
      </div>

      {/* Expandable details panel */}
      {expanded && hasDetails && (
        <DetailsPanel fields={parsed.fields} meta={meta} />
      )}
    </div>
  )
}

// ── Timestamp ──

function Timestamp({ value, raw }: { value: string | null; raw: string }) {
  const display = value ?? '--:--:--'
  const rel = useMemo(() => {
    if (!value) return ''
    // Try to build a full ISO from the raw line for relative time
    const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)
    return isoMatch ? relativeTime(isoMatch[0]) : ''
  }, [value, raw])

  return (
    <span className="text-gray-500 shrink-0 text-[10px] w-[58px]" title={rel || undefined}>
      {display}
    </span>
  )
}

// ── Level Badge ──

function LevelBadge({ level, color }: { level: string; color?: string }) {
  return (
    <span
      className="shrink-0 font-bold text-[10px] w-[52px]"
      style={{ color: color ?? '#d4d4d4' }}
    >
      {level.slice(0, 8).padEnd(8)}
    </span>
  )
}

// ── Message with field highlighting ──

function MessageContent({
  message, fields, meta, parsedFields,
}: {
  message: string
  fields: CompiledField[]
  meta: LogMeta | null
  parsedFields: Record<string, string>
}) {
  // Check for HTTP request pattern
  const method = parsedFields.method
  const path = parsedFields.path
  const statusCode = parsedFields.status_code ? parseInt(parsedFields.status_code) : null

  return (
    <span className="text-gray-300 whitespace-pre-wrap break-all min-w-0">
      {/* HTTP request badge if present */}
      {method && (
        <HttpBadge method={method} path={path} statusCode={statusCode} meta={meta} />
      )}

      {/* Message text with field highlights */}
      <HighlightedText text={message} fields={fields} meta={meta} />

      {/* Duration badge if present */}
      {parsedFields.duration_ms && (
        <span className="ml-1 text-[10px]" style={{ color: '#B39DDB' }}>
          ({parsedFields.duration_ms}ms)
        </span>
      )}
    </span>
  )
}

// ── HTTP Request Badge ──

function HttpBadge({
  method, path, statusCode, meta,
}: {
  method: string
  path?: string
  statusCode: number | null
  meta: LogMeta | null
}) {
  const statusColor = statusCode && meta
    ? httpStatusColor(statusCode, meta.http_status_colors)
    : '#9E9E9E'

  return (
    <span className="inline-flex items-baseline gap-1 mr-1.5">
      <span className="font-bold text-[10px]" style={{ color: '#90CAF9' }}>
        {method}
      </span>
      {path && (
        <span className="text-[10px] truncate max-w-[200px]" style={{ color: '#CE93D8' }} title={path}>
          {path}
        </span>
      )}
      {statusCode && (
        <span
          className="text-[10px] font-bold px-1 rounded"
          style={{ color: statusColor, backgroundColor: `${statusColor}20` }}
        >
          {statusCode}
        </span>
      )}
    </span>
  )
}

// ── Text with field highlights ──

function HighlightedText({
  text, fields, meta,
}: {
  text: string
  fields: CompiledField[]
  meta: LogMeta | null
}) {
  const segments = useMemo(() => {
    if (!fields.length) return [{ type: 'text' as const, text }]
    return buildSegments(text, fields, meta?.clickable_fields ?? {})
  }, [text, fields, meta])

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'field' ? (
          <FieldBadge key={i} {...seg} />
        ) : seg.type === 'error' ? (
          <span key={i} className="text-red-400 font-bold">{seg.text}</span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

// ── Clickable Field Badge ──

function FieldBadge({
  name, value, color, prefix, truncate,
}: {
  name: string
  value: string
  color: string
  prefix?: string
  truncate?: number
}) {
  const display = truncate && truncate > 0 && value.length > truncate
    ? value.slice(0, truncate) + '...'
    : value
  const label = prefix ? `${prefix}:${display}` : `${name}=${display}`

  return (
    <span
      className="inline cursor-pointer hover:opacity-80"
      title={`${name}: ${value}`}
      style={{ color, textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}
    >
      {label}
    </span>
  )
}

// ── Expandable Details Panel ──

function DetailsPanel({
  fields, meta,
}: {
  fields: Record<string, string>
  meta: LogMeta | null
}) {
  // Group fields into sections
  const idFields = ['job_id', 'request_id', 'user_id', 'provider_id', 'account_id', 'asset_id', 'generation_id', 'submission_id', 'provider_job_id']
  const serviceFields = ['service_key', 'service', 'pid', 'port', 'running', 'status', 'health_status']
  const timingFields = ['duration_ms', 'attempt', 'stage', 'retry_count']
  const skipFields = new Set(['timestamp', 'level', 'msg', 'event', 'method', 'path', 'status_code'])

  const ids = idFields.filter((k) => k in fields)
  const svc = serviceFields.filter((k) => k in fields)
  const timing = timingFields.filter((k) => k in fields)
  const shown = new Set([...ids, ...svc, ...timing, ...skipFields])
  const other = Object.keys(fields).filter((k) => !shown.has(k))

  return (
    <div className="ml-6 my-1 p-2 text-[10px] bg-[#1e1e1e] border-l-2 border-blue-500/50 rounded-r">
      {ids.length > 0 && <FieldGroup title="IDs" keys={ids} fields={fields} meta={meta} />}
      {svc.length > 0 && <FieldGroup title="Service" keys={svc} fields={fields} meta={meta} />}
      {timing.length > 0 && <FieldGroup title="Timing" keys={timing} fields={fields} meta={meta} />}
      {other.length > 0 && <FieldGroup title="Other" keys={other} fields={fields} meta={meta} />}
    </div>
  )
}

function FieldGroup({
  title, keys, fields, meta,
}: {
  title: string
  keys: string[]
  fields: Record<string, string>
  meta: LogMeta | null
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="text-blue-400/70 font-bold mb-0.5">{title}</div>
      {keys.map((k) => {
        const val = fields[k]
        const cfMeta = meta?.clickable_fields[k]
        const color = cfMeta?.color ?? '#a0a0a0'
        return (
          <div key={k} className="flex gap-2 pl-2">
            <span className="text-gray-500 w-[120px] shrink-0 truncate">{k}</span>
            <span style={{ color }}>{val}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Segment builder ──

interface TextSegment { type: 'text'; text: string }
interface FieldSegment { type: 'field'; name: string; value: string; color: string; prefix?: string; truncate?: number }
interface ErrorSegment { type: 'error'; text: string }
type Segment = TextSegment | FieldSegment | ErrorSegment

function buildSegments(
  text: string,
  fields: CompiledField[],
  clickableMeta: Record<string, ClickableFieldMeta>,
): Segment[] {
  // Find all field matches
  const matches: { start: number; end: number; name: string; value: string; color: string; prefix?: string; truncate?: number }[] = []

  for (const f of fields) {
    f.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = f.regex.exec(text)) !== null) {
      const cm = clickableMeta[f.name]
      matches.push({
        start: m.index, end: m.index + m[0].length,
        name: f.name, value: m[1] || m[0], color: cm?.color ?? f.color,
        prefix: cm?.prefix, truncate: cm?.truncate,
      })
    }
  }

  if (!matches.length) {
    // Check for error patterns
    if (/\bError\b|\bException\b|\bTraceback\b/i.test(text)) {
      return [{ type: 'error', text }]
    }
    return [{ type: 'text', text }]
  }

  matches.sort((a, b) => a.start - b.start)
  const segs: Segment[] = []
  let cursor = 0

  for (const m of matches) {
    if (m.start < cursor) continue
    if (m.start > cursor) segs.push({ type: 'text', text: text.slice(cursor, m.start) })
    segs.push({ type: 'field', name: m.name, value: m.value, color: m.color, prefix: m.prefix, truncate: m.truncate })
    cursor = m.end
  }
  if (cursor < text.length) segs.push({ type: 'text', text: text.slice(cursor) })
  return segs
}
