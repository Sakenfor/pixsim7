/**
 * Log rendering metadata — fetched once from /logs/meta.
 * Single source of truth for level colors, field definitions,
 * service colors, and clickable field metadata.
 */

export interface LevelStyle {
  color: string
  bg: string
}

export interface FieldDefinition {
  name: string
  color: string
  clickable: boolean
  pattern: string
  description: string
}

export interface ClickableFieldMeta {
  prefix: string
  truncate: number
  color: string
}

// ── Filter types ──

export interface TimeRangeOption { value: number; label: string }
export interface AutoRefreshOption { value: number; label: string }

export interface FilterPreset {
  id: string
  label: string
  description?: string
  api_filters: Record<string, unknown>
  include_patterns: string[]
  exclude_patterns: string[]
  highlight_patterns?: string[]
}

export interface FilterConfig {
  level_options: string[]
  service_options: string[]
  channel_options: string[]
  domain_options: string[]
  stage_options: string[]
  provider_options: string[]
  time_range_options: TimeRangeOption[]
  limit_options: number[]
  auto_refresh_options: AutoRefreshOption[]
  presets: FilterPreset[]
}

export interface FormatSpec {
  description: string
  pattern: string
  groups: string[]
  timestamp_format?: string
  level_width?: number
  service_width?: number
  event_width?: number
  level_abbreviations?: Record<string, string>
  skip_fields?: string[]
}

export interface LogMeta {
  level_colors: Record<string, LevelStyle>
  service_colors: Record<string, string>
  http_status_colors: Record<string, string>
  fields: FieldDefinition[]
  clickable_fields: Record<string, ClickableFieldMeta>
  filters: FilterConfig
  formats: Record<string, FormatSpec>
}

let _cache: LogMeta | null = null
let _promise: Promise<LogMeta> | null = null

const FALLBACK_FILTERS: FilterConfig = {
  level_options: ['', 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'],
  service_options: ['', 'api', 'worker'],
  channel_options: ['', 'cron', 'pipeline', 'api', 'system'],
  domain_options: [''],
  stage_options: [''],
  provider_options: [''],
  time_range_options: [
    { value: 5, label: '5m' }, { value: 15, label: '15m' },
    { value: 60, label: '1h' }, { value: 360, label: '6h' },
    { value: 1440, label: '24h' }, { value: 0, label: 'All' },
  ],
  limit_options: [100, 250, 500],
  auto_refresh_options: [
    { value: 0, label: 'Off' }, { value: 2000, label: '2s' },
    { value: 5000, label: '5s' }, { value: 10000, label: '10s' },
  ],
  presets: [],
}

const FALLBACK: LogMeta = {
  level_colors: {
    DEBUG:    { color: '#888888', bg: 'rgba(136,136,136,0.08)' },
    INFO:     { color: '#4FC3F7', bg: 'rgba(79,195,247,0.08)' },
    WARNING:  { color: '#FFB74D', bg: 'rgba(255,183,77,0.12)' },
    ERROR:    { color: '#EF5350', bg: 'rgba(239,83,80,0.12)' },
    CRITICAL: { color: '#FF1744', bg: 'rgba(255,23,68,0.18)' },
  },
  service_colors: { api: '#81C784', worker: '#64B5F6', launcher: '#FFD54F', game: '#BA68C8' },
  http_status_colors: { '2xx': '#4CAF50', '4xx': '#FF9800', '5xx': '#F44336', other: '#9E9E9E' },
  fields: [],
  clickable_fields: {},
  filters: FALLBACK_FILTERS,
  formats: {},
}

export async function getLogMeta(): Promise<LogMeta> {
  if (_cache) return _cache
  if (_promise) return _promise
  _promise = fetch('/logs/meta')
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((data: LogMeta) => { _cache = data; return data })
    .catch(() => FALLBACK)
  return _promise
}

// Compiled field regex patterns
export interface CompiledField extends FieldDefinition {
  regex: RegExp
}

let _compiled: CompiledField[] | null = null

export async function getCompiledFields(): Promise<CompiledField[]> {
  if (_compiled) return _compiled
  const meta = await getLogMeta()
  _compiled = meta.fields
    .filter((f) => f.pattern)
    .map((f) => ({ ...f, regex: new RegExp(f.pattern, 'g') }))
  return _compiled
}

// ── Parsing helpers ──

const LEVEL_PATTERNS: [string, RegExp][] = [
  ['CRITICAL', /\bCRIT(ICAL)?\b/i],
  ['ERROR', /\bERR(OR)?\b/i],
  ['WARNING', /\bWARN(ING)?\b/i],
  ['INFO', /\bINFO\b/i],
  ['DEBUG', /\bDEBUG\b/i],
]

export function detectLevel(line: string): string {
  for (const [level, re] of LEVEL_PATTERNS) {
    if (re.test(line)) return level
  }
  return 'INFO'
}

// Timestamp extraction: [HH:MM:SS], HH:MM:SS: (ARQ), or ISO 8601
const TS_BRACKET = /^\[(\d{2}:\d{2}:\d{2})\]\s*/
const TS_BARE = /^(\d{2}:\d{2}:\d{2}):?\s+/  // ARQ worker format: "21:11:21:  message"
const TS_ISO = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})[^\s]*/

export interface ParsedLine {
  timestamp: string | null
  level: string
  service: string | null
  message: string
  fields: Record<string, string>
  raw: string
}

// ANSI stripping
const ANSI_RE = /\x1b\[[0-9;]*m/g

function stripAnsi(text: string): string {
  return text.includes('\x1b') ? text.replace(ANSI_RE, '') : text
}

// CleanConsoleRenderer regex — compiled from format spec or hardcoded fallback
// Matches: [HH:MM:SS] LEVEL  service    event_name   key=val key=val
const CLEAN_CONSOLE_RE = /^\[(\d{2}:\d{2}:\d{2})\]\s+(\w{3,8})\s+(\S+)\s+(\S+)(?:\s+(.*))?$/

const LEVEL_ALIASES: Record<string, string> = {
  WARN: 'WARNING', ERR: 'ERROR', CRIT: 'CRITICAL',
}

/**
 * Parse a structured log line into components.
 *
 * Tries CleanConsoleRenderer format first (precise match),
 * then falls back to heuristic parsing for other formats.
 */
export function parseLine(raw: string): ParsedLine {
  const clean = stripAnsi(raw)

  // 1. CleanConsoleRenderer format (most common)
  const ccMatch = CLEAN_CONSOLE_RE.exec(clean)
  if (ccMatch) {
    const [, ts, lvl, svc, event, remainder] = ccMatch
    const level = LEVEL_ALIASES[lvl.toUpperCase()] ?? lvl.toUpperCase()
    const fields: Record<string, string> = {}
    const kvRegex = /\b([a-z_]{2,20})=(\S+)/g
    let m: RegExpExecArray | null
    const msg = remainder ?? ''
    while ((m = kvRegex.exec(msg)) !== null) fields[m[1]] = m[2]
    return { timestamp: ts, level, service: svc, message: `${event} ${msg}`.trim(), fields, raw }
  }

  // 2. Fallback: heuristic parsing
  let rest = clean
  let timestamp: string | null = null
  let level = 'INFO'
  let service: string | null = null

  // Timestamp
  const bracketMatch = TS_BRACKET.exec(rest)
  if (bracketMatch) {
    timestamp = bracketMatch[1]
    rest = rest.slice(bracketMatch[0].length)
  } else {
    const isoMatch = TS_ISO.exec(rest)
    if (isoMatch) {
      const full = isoMatch[1]
      const tIdx = full.indexOf('T')
      timestamp = tIdx >= 0 ? full.slice(tIdx + 1) : full.slice(11)
      rest = rest.slice(isoMatch[0].length).replace(/^\s*/, '')
    } else {
      const bareMatch = TS_BARE.exec(rest)
      if (bareMatch) {
        timestamp = bareMatch[1]
        rest = rest.slice(bareMatch[0].length)
      }
    }
  }

  // Level
  const levelMatch = /^\[?(\w+)\]?[:\s]\s*/.exec(rest)
  if (levelMatch) {
    const candidate = levelMatch[1].toUpperCase()
    const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'WARN', 'ERROR', 'ERR', 'CRITICAL', 'CRIT']
    if (LEVELS.includes(candidate)) {
      level = LEVEL_ALIASES[candidate] ?? candidate
      rest = rest.slice(levelMatch[0].length)
    }
  }
  if (level === 'INFO') level = detectLevel(raw)

  // Uvicorn access log
  const uvicornMatch = /^(\d+\.\d+\.\d+\.\d+):?\d*\s+-\s+"(\w+)\s+(\S+)\s+HTTP\/[\d.]+"?\s+(\d+)/.exec(rest)
  if (uvicornMatch) {
    const [, , method, path, status] = uvicornMatch
    rest = `http_request method=${method} path=${path} status_code=${status}`
  }

  // Service
  const svcMatch = /^([a-zA-Z][a-zA-Z0-9_.-]{0,15})\s+/.exec(rest)
  if (svcMatch) {
    service = svcMatch[1]
    rest = rest.slice(svcMatch[0].length)
  }

  // Fields
  const fields: Record<string, string> = {}
  const kvRegex = /\b([a-z_]{2,20})=(\S+)/g
  let m: RegExpExecArray | null
  while ((m = kvRegex.exec(rest)) !== null) fields[m[1]] = m[2]

  return { timestamp, level, service, message: rest.trim(), fields, raw }
}

/**
 * Get HTTP status color range.
 */
export function httpStatusColor(code: number, colors: Record<string, string>): string {
  if (code >= 200 && code < 300) return colors['2xx'] ?? '#4CAF50'
  if (code >= 400 && code < 500) return colors['4xx'] ?? '#FF9800'
  if (code >= 500) return colors['5xx'] ?? '#F44336'
  return colors['other'] ?? '#9E9E9E'
}

/**
 * Format relative time from ISO timestamp.
 */
export function relativeTime(isoOrTime: string): string {
  try {
    const d = new Date(isoOrTime)
    if (isNaN(d.getTime())) return ''
    const delta = (Date.now() - d.getTime()) / 1000
    if (delta < 60) return `${Math.floor(delta)}s ago`
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
    return `${Math.floor(delta / 86400)}d ago`
  } catch {
    return ''
  }
}
