/**
 * Log Viewer Panel
 *
 * Dense structured log viewer for debugging worker/generation pipeline issues.
 * Primary data source: GET /api/v1/logs/query (structured DB logs).
 * Trace pivots: job trace & request trace drawers.
 * Preset filters: combine API-side narrowing with client-side include/exclude.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import {
  queryLogs,
  getJobTrace,
  getRequestTrace,
  getTraceIdTrace,
  type LogEntryResponse,
  type LogQueryParams,
  type LogQueryResponse,
} from '@lib/api/logs';
import { Icon } from '@lib/icons';

import {
  BUILTIN_PRESETS,
  applyClientFilters,
  type LogFilterPreset,
  type ClientFilterResult,
} from './logFilterPresets';

// =============================================================================
// Types & Constants
// =============================================================================

type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';
type LimitOption = 100 | 250 | 500;

interface FilterState {
  search: string;
  level: string;
  service: string;
  stage: string;
  channel: string;
  providerId: string;
  jobId: string;
  requestId: string;
  traceId: string;
  timeRange: TimeRange;
  limit: LimitOption;
}

interface TraceView {
  type: 'job' | 'request' | 'trace';
  id: string;
  logs: LogEntryResponse[];
  loading: boolean;
  error: string | null;
}

const LEVEL_OPTIONS = ['', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
const CHANNEL_OPTIONS = ['', 'cron', 'pipeline', 'api', 'system'] as const;

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: 'all', label: 'All' },
];

const LIMIT_OPTIONS: LimitOption[] = [100, 250, 500];

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 2000, label: '2s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
];

type ViewMode = 'table' | 'plain';

const DEFAULT_FILTERS: FilterState = {
  search: '',
  level: '',
  service: '',
  stage: '',
  channel: '',
  providerId: '',
  jobId: '',
  requestId: '',
  traceId: '',
  timeRange: '1h',
  limit: 100,
};

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-neutral-500',
  INFO: 'text-blue-400',
  WARNING: 'text-amber-400',
  ERROR: 'text-red-400',
  CRITICAL: 'text-red-500 font-bold',
};

// =============================================================================
// Helpers
// =============================================================================

function getStartTime(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const ms: Record<string, number> = {
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '24h': 24 * 60 * 60_000,
  };
  return new Date(Date.now() - ms[range]).toISOString();
}

function buildQueryParams(filters: FilterState): LogQueryParams {
  const params: LogQueryParams = { limit: filters.limit };
  if (filters.search) params.search = filters.search;
  if (filters.level) params.level = filters.level;
  if (filters.service) params.service = filters.service;
  if (filters.stage) {
    if (filters.stage.endsWith('.') || !filters.stage.includes('.')) {
      params.stage_prefix = filters.stage;
    } else {
      params.stage = filters.stage;
    }
  }
  if (filters.channel) params.channel = filters.channel;
  if (filters.providerId) params.provider_id = filters.providerId;
  if (filters.jobId) {
    const n = parseInt(filters.jobId, 10);
    if (!isNaN(n)) params.job_id = n;
  }
  if (filters.requestId) params.request_id = filters.requestId;
  if (filters.traceId) params.trace_id = filters.traceId;
  const startTime = getStartTime(filters.timeRange);
  if (startTime) params.start_time = startTime;
  return params;
}

function getTraceId(log: LogEntryResponse): string | null {
  const direct = (log as { trace_id?: string | null }).trace_id;
  if (direct) return direct;
  if (!log.extra || typeof log.extra !== 'object') return null;
  const fromExtra = (log.extra as Record<string, unknown>).trace_id;
  return typeof fromExtra === 'string' && fromExtra ? fromExtra : null;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '\u2014';
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

// =============================================================================
// Plain text formatting
// =============================================================================

function formatLogAsPlainText(log: LogEntryResponse): string {
  const ts = formatTimestamp(log.timestamp);
  const lvl = (log.level ?? '').padEnd(8);
  const msg = log.msg ?? '';

  // Build context tag: service / channel / stage collapsed into a compact path
  const parts: string[] = [];
  if (log.service && log.service !== 'unknown') parts.push(log.service);
  if (log.channel) parts.push(log.channel);
  if (log.stage) parts.push(log.stage);
  const context = parts.length > 0 ? `[${parts.join(' > ')}]` : '';

  // Build trailing metadata tags — only non-empty fields
  const meta: string[] = [];
  if (log.job_id != null) meta.push(`job=${log.job_id}`);
  if (log.request_id) meta.push(`req=${log.request_id.slice(0, 8)}`);
  const traceId = getTraceId(log);
  if (traceId) meta.push(`trace=${traceId.slice(0, 8)}`);
  if (log.provider_id) meta.push(`provider=${log.provider_id}`);
  if (log.provider_job_id) meta.push(`pjob=${log.provider_job_id}`);
  if (log.operation_type) meta.push(`op=${log.operation_type}`);
  if (log.submission_id != null) meta.push(`sub=${log.submission_id}`);
  if (log.generation_id != null) meta.push(`gen=${log.generation_id}`);
  if (log.duration_ms != null) meta.push(`${log.duration_ms}ms`);
  if (log.attempt != null) meta.push(`attempt=${log.attempt}`);
  const metaStr = meta.length > 0 ? `  (${meta.join(', ')})` : '';

  // Error on next line if present
  const errPart = log.error
    ? `\n         ${log.error_type ? `${log.error_type}: ` : ''}${log.error}`
    : '';

  // Extra JSON (compact single-line summary of keys)
  const extraPart =
    log.extra && Object.keys(log.extra).length > 0
      ? `\n         extra: ${JSON.stringify(log.extra)}`
      : '';

  return `${ts} ${lvl}${context ? ` ${context}` : ''} ${msg}${metaStr}${errPart}${extraPart}`;
}

function logsToClipboardText(logs: LogEntryResponse[]): string {
  return logs.map(formatLogAsPlainText).join('\n');
}

// =============================================================================
// useLogQuery hook
// =============================================================================

function useLogQuery(filters: FilterState) {
  const [data, setData] = useState<LogQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildQueryParams(filters);
      const result = await queryLogs(params);
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to query logs');
    } finally {
      setLoading(false);
    }
  }, [
    filters.search,
    filters.level,
    filters.service,
    filters.stage,
    filters.channel,
    filters.providerId,
    filters.jobId,
    filters.requestId,
    filters.traceId,
    filters.timeRange,
    filters.limit,
  ]);

  return { data, loading, error, refetch: fetch };
}

// =============================================================================
// Preset Picker
// =============================================================================

function PresetPicker({
  activePreset,
  onApply,
  onClear,
}: {
  activePreset: LogFilterPreset | null;
  onApply: (preset: LogFilterPreset) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={activePreset?.id ?? ''}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) {
            onClear();
            return;
          }
          const preset = BUILTIN_PRESETS.find((p) => p.id === id);
          if (preset) onApply(preset);
        }}
        className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none max-w-[200px]"
      >
        <option value="">Preset\u2026</option>
        {BUILTIN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      {activePreset && (
        <button
          onClick={onClear}
          className="px-1.5 py-0.5 rounded text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
          title="Clear preset"
        >
          <Icon name="x" size={10} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Active Preset Banner
// =============================================================================

function PresetBanner({
  preset,
  clientResult,
  onClear,
}: {
  preset: LogFilterPreset;
  clientResult: ClientFilterResult;
  onClear: () => void;
}) {
  const hasClientFiltering =
    preset.includePatterns.length > 0 || preset.excludePatterns.length > 0;
  const wasFiltered = clientResult.filtered.length !== clientResult.totalFromApi;

  return (
    <div className="px-3 py-1.5 bg-emerald-950/30 border-b border-emerald-900/40 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon name="filter" size={11} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-emerald-300">{preset.label}</span>
          {hasClientFiltering && wasFiltered && (
            <span className="text-[11px] text-neutral-400 tabular-nums">
              showing {clientResult.filtered.length} / {clientResult.totalFromApi} rows
            </span>
          )}
          <button
            onClick={onClear}
            className="text-[11px] text-neutral-500 hover:text-neutral-300 ml-auto shrink-0"
          >
            Clear
          </button>
        </div>
        {preset.description && (
          <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{preset.description}</p>
        )}
        {/* Include/Exclude chips */}
        {hasClientFiltering && (
          <div className="flex gap-1 flex-wrap mt-1">
            {preset.includePatterns.slice(0, 6).map((p) => (
              <span
                key={p}
                className="px-1.5 py-0 rounded text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/40"
              >
                +{p}
              </span>
            ))}
            {preset.includePatterns.length > 6 && (
              <span className="text-[10px] text-neutral-500">
                +{preset.includePatterns.length - 6} more
              </span>
            )}
            {preset.excludePatterns.slice(0, 3).map((p) => (
              <span
                key={p}
                className="px-1.5 py-0 rounded text-[10px] bg-red-900/30 text-red-400 border border-red-800/40"
              >
                -{p}
              </span>
            ))}
            {preset.excludePatterns.length > 3 && (
              <span className="text-[10px] text-neutral-500">
                -{preset.excludePatterns.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Filter Bar
// =============================================================================

function FilterBar({
  filters,
  onChange,
  onRefresh,
  loading,
  autoRefreshMs,
  onAutoRefreshChange,
  total,
  activePreset,
  onApplyPreset,
  onClearPreset,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onRefresh: () => void;
  loading: boolean;
  autoRefreshMs: number;
  onAutoRefreshChange: (ms: number) => void;
  total: number | null;
  activePreset: LogFilterPreset | null;
  onApplyPreset: (preset: LogFilterPreset) => void;
  onClearPreset: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = (value: string) => {
    setSearchDraft(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange({ search: value }), 400);
  };

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  return (
    <div className="space-y-2 p-3 border-b border-neutral-700">
      {/* Row 1: Search + Preset + Refresh */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Search logs\u2026"
          value={searchDraft}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <PresetPicker
          activePreset={activePreset}
          onApply={onApplyPreset}
          onClear={onClearPreset}
        />
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-xs hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-1"
          title="Refresh"
        >
          <Icon name="refreshCw" size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <select
          value={autoRefreshMs}
          onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
          className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none"
          title="Auto-refresh interval"
        >
          {AUTO_REFRESH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {total !== null && (
          <span className="text-xs text-neutral-500 tabular-nums whitespace-nowrap">
            {total} total
          </span>
        )}
      </div>

      {/* Row 2: Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={filters.level}
          onChange={(e) => onChange({ level: e.target.value })}
          className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none"
        >
          {LEVEL_OPTIONS.map((l) => (
            <option key={l} value={l}>
              {l || 'All Levels'}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Service"
          value={filters.service}
          onChange={(e) => onChange({ service: e.target.value })}
          className="w-24 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        <input
          type="text"
          placeholder="Stage"
          value={filters.stage}
          onChange={(e) => onChange({ stage: e.target.value })}
          className="w-28 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        <select
          value={filters.channel}
          onChange={(e) => onChange({ channel: e.target.value })}
          className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none"
        >
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c || 'All Channels'}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Provider"
          value={filters.providerId}
          onChange={(e) => onChange({ providerId: e.target.value })}
          className="w-24 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        <input
          type="text"
          placeholder="Job ID"
          value={filters.jobId}
          onChange={(e) => onChange({ jobId: e.target.value })}
          className="w-20 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        <input
          type="text"
          placeholder="Request ID"
          value={filters.requestId}
          onChange={(e) => onChange({ requestId: e.target.value })}
          className="w-28 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        <input
          type="text"
          placeholder="Trace ID"
          value={filters.traceId}
          onChange={(e) => onChange({ traceId: e.target.value })}
          className="w-28 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        {/* Time range chips */}
        <div className="flex gap-1 ml-1">
          {TIME_RANGE_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => onChange({ timeRange: t.value })}
              className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                filters.timeRange === t.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          value={filters.limit}
          onChange={(e) => onChange({ limit: Number(e.target.value) as LimitOption })}
          className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none"
        >
          {LIMIT_OPTIONS.map((l) => (
            <option key={l} value={l}>
              {l} rows
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// =============================================================================
// Log Row
// =============================================================================

function LogRow({
  log,
  expanded,
  highlighted,
  onToggle,
  onJobClick,
  onRequestClick,
  onTraceClick,
}: {
  log: LogEntryResponse;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onJobClick: (jobId: number) => void;
  onRequestClick: (requestId: string) => void;
  onTraceClick: (traceId: string) => void;
}) {
  const levelClass = LEVEL_COLORS[log.level] || 'text-neutral-400';
  const traceId = getTraceId(log);
  const hasExtra =
    log.error || log.extra || log.duration_ms != null || log.attempt != null;

  const isError = log.level === 'ERROR' || log.level === 'CRITICAL';
  let rowBg = '';
  if (highlighted) rowBg = 'bg-amber-950/20';
  else if (isError) rowBg = 'bg-red-950/20';

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer text-xs ${rowBg}`}
      >
        {/* Timestamp */}
        <td className="px-2 py-1 font-mono text-neutral-500 whitespace-nowrap tabular-nums">
          {formatTimestamp(log.timestamp)}
        </td>

        {/* Level */}
        <td className={`px-2 py-1 font-mono whitespace-nowrap ${levelClass}`}>
          {log.level}
        </td>

        {/* Service */}
        <td className="px-2 py-1 font-mono text-purple-400 whitespace-nowrap max-w-[100px] truncate">
          {log.service}
        </td>

        {/* Channel */}
        <td className="px-2 py-1 font-mono text-amber-400 whitespace-nowrap max-w-[80px] truncate">
          {log.channel ?? '\u2014'}
        </td>

        {/* Stage */}
        <td className="px-2 py-1 font-mono text-cyan-400 whitespace-nowrap max-w-[120px] truncate">
          {log.stage ?? '\u2014'}
        </td>

        {/* Message */}
        <td className="px-2 py-1 text-neutral-300 max-w-[400px] truncate" title={log.msg ?? ''}>
          {truncate(log.msg, 120)}
        </td>

        {/* Job ID */}
        <td className="px-2 py-1 font-mono whitespace-nowrap">
          {log.job_id != null ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJobClick(log.job_id!);
              }}
              className="text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              {log.job_id}
            </button>
          ) : (
            <span className="text-neutral-600">{'\u2014'}</span>
          )}
        </td>

        {/* Request ID */}
        <td className="px-2 py-1 font-mono whitespace-nowrap max-w-[100px] truncate">
          {log.request_id ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRequestClick(log.request_id!);
              }}
              className="text-emerald-400 hover:text-emerald-300 hover:underline"
              title={log.request_id}
            >
              {log.request_id.slice(0, 8)}
            </button>
          ) : (
            <span className="text-neutral-600">{'\u2014'}</span>
          )}
        </td>

        {/* Expand indicator */}
        <td className="px-1 py-1 text-neutral-600">
          {hasExtra && (
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={10} />
          )}
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && (
        <tr className="bg-neutral-850">
          <td colSpan={9} className="px-4 py-2">
            <LogRowDetail log={log} />
            <div className="flex gap-2 mt-2">
              {traceId && (
                <button
                  onClick={() => onTraceClick(traceId)}
                  className="text-[11px] text-emerald-400 hover:underline font-mono"
                >
                  View Trace {traceId.slice(0, 8)}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// =============================================================================
// Log Row Detail (expanded)
// =============================================================================

function LogRowDetail({ log }: { log: LogEntryResponse }) {
  const traceId = getTraceId(log);
  return (
    <div className="space-y-2 text-xs">
      {/* Full message */}
      {log.msg && (
        <div>
          <span className="text-neutral-500 mr-2">msg:</span>
          <span className="text-neutral-300 font-mono whitespace-pre-wrap break-all">
            {log.msg}
          </span>
        </div>
      )}

      {/* Error */}
      {log.error && (
        <div className="p-2 bg-red-950/30 border border-red-900/40 rounded">
          <span className="text-red-400 font-mono text-[11px] block">
            {log.error_type && (
              <span className="text-red-500 font-semibold">{log.error_type}: </span>
            )}
            <span className="whitespace-pre-wrap break-all">{log.error}</span>
          </span>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
        <MetaField label="ID" value={String(log.id)} />
        <MetaField label="Service" value={log.service} />
        <MetaField label="Channel" value={log.channel} />
        <MetaField label="Stage" value={log.stage} />
        <MetaField label="Level" value={log.level} />
        <MetaField label="Env" value={log.env} />
        <MetaField label="Job ID" value={log.job_id != null ? String(log.job_id) : null} />
        <MetaField label="Request ID" value={log.request_id} mono />
        <MetaField label="Trace ID" value={traceId} mono />
        <MetaField label="Submission ID" value={log.submission_id != null ? String(log.submission_id) : null} />
        <MetaField label="Generation ID" value={log.generation_id != null ? String(log.generation_id) : null} />
        <MetaField label="Provider" value={log.provider_id} />
        <MetaField label="Provider Job" value={log.provider_job_id} mono />
        <MetaField label="Operation" value={log.operation_type} />
        <MetaField label="Duration" value={log.duration_ms != null ? `${log.duration_ms}ms` : null} />
        <MetaField label="Attempt" value={log.attempt != null ? String(log.attempt) : null} />
        <MetaField label="User ID" value={log.user_id != null ? String(log.user_id) : null} />
      </div>

      {/* Extra JSON */}
      {log.extra && Object.keys(log.extra).length > 0 && (
        <div>
          <span className="text-neutral-500 block mb-1">extra:</span>
          <pre className="p-2 bg-neutral-800 rounded text-[11px] font-mono text-neutral-300 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(log.extra, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function MetaField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-neutral-500 text-[11px] shrink-0">{label}:</span>
      <span
        className={`text-neutral-300 text-[11px] truncate ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

// =============================================================================
// Trace Drawer
// =============================================================================

function TraceDrawer({
  trace,
  onClose,
  onJobClick,
  onRequestClick,
  onTraceClick,
}: {
  trace: TraceView;
  onClose: () => void;
  onJobClick: (jobId: number) => void;
  onRequestClick: (requestId: string) => void;
  onTraceClick: (traceId: string) => void;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="border-l border-neutral-700 bg-neutral-900 flex flex-col w-[500px] min-w-[400px] max-w-[600px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 bg-neutral-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="gitBranch" size={14} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-neutral-200 truncate">
            {trace.type === 'job' ? 'Job' : trace.type === 'request' ? 'Request' : 'Trace'} Trace
          </span>
          <code className="text-xs font-mono text-emerald-400 truncate">{trace.id}</code>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-neutral-700 rounded"
          title="Close trace"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {trace.loading && (
          <div className="p-4 text-neutral-400 text-xs flex items-center gap-2">
            <Icon name="refreshCw" size={12} className="animate-spin" />
            Loading trace...
          </div>
        )}

        {trace.error && (
          <div className="p-4 text-red-400 text-xs">{trace.error}</div>
        )}

        {!trace.loading && !trace.error && trace.logs.length === 0 && (
          <div className="p-4 text-neutral-500 text-xs">No logs found for this trace.</div>
        )}

        {!trace.loading && trace.logs.length > 0 && (
          <table className="w-full text-left">
            <thead className="bg-neutral-800/50 sticky top-0">
              <tr className="text-[11px] text-neutral-500 uppercase tracking-wider">
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Level</th>
                <th className="px-2 py-1">Stage</th>
                <th className="px-2 py-1">Message</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {trace.logs.map((log) => {
                const isExpanded = expandedRows.has(log.id);
                const levelClass = LEVEL_COLORS[log.level] || 'text-neutral-400';
                const hasExtra =
                  log.error || log.extra || log.duration_ms != null;

                return (
                  <TraceLogRow
                    key={log.id}
                    log={log}
                    expanded={isExpanded}
                    levelClass={levelClass}
                    hasExtra={hasExtra}
                    onToggle={() => toggleRow(log.id)}
                    onJobClick={onJobClick}
                    onRequestClick={onRequestClick}
                    onTraceClick={onTraceClick}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!trace.loading && trace.logs.length > 0 && (
        <div className="px-3 py-1.5 border-t border-neutral-700 text-[11px] text-neutral-500">
          {trace.logs.length} log entries
        </div>
      )}
    </div>
  );
}

function TraceLogRow({
  log,
  expanded,
  levelClass,
  hasExtra,
  onToggle,
  onJobClick,
  onRequestClick,
  onTraceClick,
}: {
  log: LogEntryResponse;
  expanded: boolean;
  levelClass: string;
  hasExtra: boolean;
  onToggle: () => void;
  onJobClick: (jobId: number) => void;
  onRequestClick: (requestId: string) => void;
  onTraceClick: (traceId: string) => void;
}) {
  const traceId = getTraceId(log);
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-800 hover:bg-neutral-800/50 cursor-pointer text-xs ${
          log.level === 'ERROR' || log.level === 'CRITICAL'
            ? 'bg-red-950/20'
            : ''
        }`}
      >
        <td className="px-2 py-1 font-mono text-neutral-500 whitespace-nowrap tabular-nums">
          {formatTimestamp(log.timestamp)}
        </td>
        <td className={`px-2 py-1 font-mono whitespace-nowrap ${levelClass}`}>
          {log.level}
        </td>
        <td className="px-2 py-1 font-mono text-cyan-400 whitespace-nowrap max-w-[100px] truncate">
          {log.stage ?? '\u2014'}
        </td>
        <td className="px-2 py-1 text-neutral-300 max-w-[200px] truncate" title={log.msg ?? ''}>
          {truncate(log.msg, 80)}
        </td>
        <td className="px-1 py-1 text-neutral-600">
          {hasExtra && (
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={10} />
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-neutral-850">
          <td colSpan={5} className="px-4 py-2">
            <LogRowDetail log={log} />
            {/* Cross-trace links */}
            <div className="flex gap-2 mt-2">
              {log.job_id != null && (
                <button
                  onClick={() => onJobClick(log.job_id!)}
                  className="text-[11px] text-emerald-400 hover:underline font-mono"
                >
                  View Job {log.job_id} Trace
                </button>
              )}
              {log.request_id && (
                <button
                  onClick={() => onRequestClick(log.request_id!)}
                  className="text-[11px] text-emerald-400 hover:underline font-mono"
                >
                  View Request {log.request_id.slice(0, 8)} Trace
                </button>
              )}
              {traceId && (
                <button
                  onClick={() => onTraceClick(traceId)}
                  className="text-[11px] text-emerald-400 hover:underline font-mono"
                >
                  View Trace {traceId.slice(0, 8)}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function LogViewerPanel() {
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [traceView, setTraceView] = useState<TraceView | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState(0);
  const [activePreset, setActivePreset] = useState<LogFilterPreset | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const { data, loading, error, refetch } = useLogQuery(filters);

  // Client-side filtering (memoized, only recomputes when API data or preset changes)
  const clientResult = useMemo<ClientFilterResult>(() => {
    const logs = data?.logs ?? [];
    return applyClientFilters(logs, activePreset);
  }, [data?.logs, activePreset]);

  // Initial fetch + refetch on filter change
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Auto-refresh
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (autoRefreshMs > 0) {
      intervalRef.current = setInterval(refetch, autoRefreshMs);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefreshMs, refetch]);

  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setExpandedRows(new Set());
  }, []);

  const handleApplyPreset = useCallback((preset: LogFilterPreset) => {
    setActivePreset(preset);
    // Merge preset's API filters into current filters, reset others to defaults
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      // Preserve user's manual overrides for fields the preset doesn't set
      timeRange: preset.apiFilters.timeRange ?? prev.timeRange,
      limit: preset.apiFilters.limit ?? prev.limit,
      // Apply preset API filters
      search: preset.apiFilters.search ?? DEFAULT_FILTERS.search,
      level: preset.apiFilters.level ?? DEFAULT_FILTERS.level,
      service: preset.apiFilters.service ?? DEFAULT_FILTERS.service,
      stage: preset.apiFilters.stage ?? DEFAULT_FILTERS.stage,
      channel: preset.apiFilters.channel ?? DEFAULT_FILTERS.channel,
      providerId: preset.apiFilters.providerId ?? DEFAULT_FILTERS.providerId,
      jobId: preset.apiFilters.jobId ?? DEFAULT_FILTERS.jobId,
      requestId: preset.apiFilters.requestId ?? DEFAULT_FILTERS.requestId,
      traceId: DEFAULT_FILTERS.traceId,
    }));
    setExpandedRows(new Set());
  }, []);

  const handleClearPreset = useCallback(() => {
    setActivePreset(null);
    setFilters({ ...DEFAULT_FILTERS });
    setExpandedRows(new Set());
  }, []);

  const toggleRow = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Trace handlers
  const openJobTrace = useCallback(async (jobId: number) => {
    setTraceView({
      type: 'job',
      id: String(jobId),
      logs: [],
      loading: true,
      error: null,
    });
    try {
      const logs = await getJobTrace(jobId);
      setTraceView((prev) =>
        prev?.id === String(jobId) ? { ...prev, logs, loading: false } : prev
      );
    } catch (e: any) {
      setTraceView((prev) =>
        prev?.id === String(jobId)
          ? { ...prev, loading: false, error: e?.message ?? 'Failed to load trace' }
          : prev
      );
    }
  }, []);

  const openRequestTrace = useCallback(async (requestId: string) => {
    setTraceView({
      type: 'request',
      id: requestId,
      logs: [],
      loading: true,
      error: null,
    });
    try {
      const logs = await getRequestTrace(requestId);
      setTraceView((prev) =>
        prev?.id === requestId ? { ...prev, logs, loading: false } : prev
      );
    } catch (e: any) {
      setTraceView((prev) =>
        prev?.id === requestId
          ? { ...prev, loading: false, error: e?.message ?? 'Failed to load trace' }
          : prev
      );
    }
  }, []);

  const openTraceIdTrace = useCallback(async (traceId: string) => {
    setTraceView({
      type: 'trace',
      id: traceId,
      logs: [],
      loading: true,
      error: null,
    });
    try {
      const logs = await getTraceIdTrace(traceId);
      setTraceView((prev) =>
        prev?.id === traceId ? { ...prev, logs, loading: false } : prev
      );
    } catch (e: any) {
      setTraceView((prev) =>
        prev?.id === traceId
          ? { ...prev, loading: false, error: e?.message ?? 'Failed to load trace' }
          : prev
      );
    }
  }, []);

  const displayLogs = clientResult.filtered;

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 bg-neutral-800/30">
        <Icon name="fileText" size={16} className="text-emerald-400" />
        <h2 className="text-sm font-semibold">Log Viewer</h2>
        <span className="text-[11px] text-neutral-500">Structured DB Logs</span>

        <div className="ml-auto flex items-center gap-1">
          {/* View mode toggle */}
          <div className="flex bg-neutral-800 rounded border border-neutral-700">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-[11px] rounded-l transition-colors ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Table view"
            >
              <Icon name="rows" size={12} />
            </button>
            <button
              onClick={() => setViewMode('plain')}
              className={`px-2 py-1 text-[11px] rounded-r transition-colors ${
                viewMode === 'plain'
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Plain text view"
            >
              <Icon name="code" size={12} />
            </button>
          </div>

          {/* Word wrap toggle (plain text mode) */}
          {viewMode === 'plain' && (
            <button
              onClick={() => setWordWrap((v) => !v)}
              className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                wordWrap
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
              title="Word wrap"
            >
              <Icon name="arrowRightLeft" size={12} />
            </button>
          )}

          {/* Expand / collapse all (table mode) */}
          {viewMode === 'table' && displayLogs.length > 0 && (
            <button
              onClick={() => {
                if (expandedRows.size > 0) {
                  setExpandedRows(new Set());
                } else {
                  setExpandedRows(new Set(displayLogs.map((l) => l.id)));
                }
              }}
              className="px-2 py-1 text-[11px] bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
              title={expandedRows.size > 0 ? 'Collapse all' : 'Expand all'}
            >
              <Icon name={expandedRows.size > 0 ? 'minimize2' : 'maximize2'} size={12} />
            </button>
          )}

          {/* Copy logs */}
          {displayLogs.length > 0 && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(logsToClipboardText(displayLogs));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="px-2 py-1 text-[11px] bg-neutral-800 border border-neutral-700 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Copy logs to clipboard"
            >
              <Icon name={copied ? 'check' : 'copy'} size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <FilterBar
            filters={filters}
            onChange={handleFilterChange}
            onRefresh={refetch}
            loading={loading}
            autoRefreshMs={autoRefreshMs}
            onAutoRefreshChange={setAutoRefreshMs}
            total={data?.total ?? null}
            activePreset={activePreset}
            onApplyPreset={handleApplyPreset}
            onClearPreset={handleClearPreset}
          />

          {/* Active preset banner */}
          {activePreset && (
            <PresetBanner
              preset={activePreset}
              clientResult={clientResult}
              onClear={handleClearPreset}
            />
          )}

          {/* Error banner */}
          {error && (
            <div className="px-3 py-2 bg-red-950/30 border-b border-red-900/40 text-red-400 text-xs flex items-center gap-2">
              <Icon name="alertCircle" size={12} />
              {error}
              <button
                onClick={refetch}
                className="ml-auto text-red-300 hover:text-red-200 underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Log content */}
          <div className="flex-1 overflow-auto">
            {displayLogs.length === 0 && !loading && !error ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-xs gap-2">
                <Icon name="inbox" size={24} className="text-neutral-600" />
                {activePreset
                  ? `No logs match preset "${activePreset.label}" with current filters`
                  : 'No logs match current filters'}
              </div>
            ) : viewMode === 'plain' ? (
              /* Plain text view */
              <pre
                className={`p-3 text-[11px] font-mono text-neutral-300 leading-relaxed select-text ${
                  wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                }`}
              >
                {displayLogs.map((log) => {
                  const isHighlighted = clientResult.highlightedIds.has(log.id);
                  const colorClass = LEVEL_COLORS[log.level] ?? 'text-neutral-300';
                  return (
                    <span
                      key={log.id}
                      className={`block ${colorClass} ${
                        isHighlighted ? 'bg-amber-950/30' : ''
                      } hover:bg-neutral-800/60`}
                    >
                      {formatLogAsPlainText(log)}
                    </span>
                  );
                })}
              </pre>
            ) : (
              /* Table view */
              <table className="w-full text-left">
                <thead className="bg-neutral-800/50 sticky top-0 z-10">
                  <tr className="text-[11px] text-neutral-500 uppercase tracking-wider">
                    <th className="px-2 py-1.5">Time</th>
                    <th className="px-2 py-1.5">Level</th>
                    <th className="px-2 py-1.5">Service</th>
                    <th className="px-2 py-1.5">Channel</th>
                    <th className="px-2 py-1.5">Stage</th>
                    <th className="px-2 py-1.5">Message</th>
                    <th className="px-2 py-1.5">Job</th>
                    <th className="px-2 py-1.5">Request</th>
                    <th className="px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {displayLogs.map((log) => (
                    <LogRow
                      key={log.id}
                      log={log}
                      expanded={expandedRows.has(log.id)}
                      highlighted={clientResult.highlightedIds.has(log.id)}
                      onToggle={() => toggleRow(log.id)}
                      onJobClick={openJobTrace}
                      onRequestClick={openRequestTrace}
                      onTraceClick={openTraceIdTrace}
                    />
                  ))}
                </tbody>
              </table>
            )}

            {loading && displayLogs.length === 0 && (
              <div className="flex items-center justify-center h-full text-neutral-400 text-xs gap-2">
                <Icon name="refreshCw" size={14} className="animate-spin" />
                Loading logs...
              </div>
            )}
          </div>
        </div>

        {/* Trace drawer */}
        {traceView && (
          <TraceDrawer
            trace={traceView}
            onClose={() => setTraceView(null)}
            onJobClick={openJobTrace}
            onRequestClick={openRequestTrace}
            onTraceClick={openTraceIdTrace}
          />
        )}
      </div>
    </div>
  );
}
