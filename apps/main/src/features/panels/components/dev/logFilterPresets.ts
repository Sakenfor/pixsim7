/**
 * Log Filter Presets
 *
 * Reusable filter configurations for the Log Viewer panel.
 * Each preset combines API-side query filters with client-side
 * include/exclude pattern matching for focused debugging workflows.
 *
 * To add a new preset: append to BUILTIN_PRESETS below.
 */

import type { LogEntryResponse } from '@lib/api/logs';

// =============================================================================
// Types
// =============================================================================

/** Time range options matching LogViewerPanel's TimeRange type */
type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';
type LimitOption = 100 | 250 | 500;

/** API-side filters applied to the /logs/query request */
export interface PresetApiFilters {
  search?: string;
  level?: string;
  service?: string;
  stage?: string;
  channel?: string;
  providerId?: string;
  jobId?: string;
  requestId?: string;
  timeRange?: TimeRange;
  limit?: LimitOption;
}

export interface LogFilterPreset {
  /** Unique identifier */
  id: string;
  /** Short display label */
  label: string;
  /** Optional longer description shown in UI */
  description?: string;
  /** API-side query filters (merged into FilterState) */
  apiFilters: PresetApiFilters;
  /**
   * Client-side include patterns (case-insensitive substring).
   * If non-empty, a log row must match at least one pattern to be shown.
   */
  includePatterns: string[];
  /**
   * Client-side exclude patterns (case-insensitive substring).
   * Any matching row is hidden regardless of include matches.
   */
  excludePatterns: string[];
  /**
   * Optional highlight patterns (case-insensitive substring).
   * Matching rows get a visual accent. Not used for filtering.
   */
  highlightPatterns?: string[];
}

// =============================================================================
// Client-side filtering
// =============================================================================

/**
 * Build a single searchable text blob from a log entry.
 * Used for include/exclude pattern matching.
 */
function logToSearchText(log: LogEntryResponse): string {
  const parts: string[] = [
    log.msg ?? '',
    log.stage ?? '',
    log.channel ?? '',
    log.service,
    log.error ?? '',
    log.error_type ?? '',
    log.provider_id ?? '',
    log.operation_type ?? '',
    log.provider_job_id ?? '',
  ];
  if (log.job_id != null) parts.push(String(log.job_id));
  if (log.request_id) parts.push(log.request_id);
  if (log.submission_id != null) parts.push(String(log.submission_id));
  return parts.join(' ').toLowerCase();
}

function matchesAny(text: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (text.includes(p.toLowerCase())) return true;
  }
  return false;
}

export interface ClientFilterResult {
  /** Rows after client-side filtering */
  filtered: LogEntryResponse[];
  /** Number of rows before filtering (from API) */
  totalFromApi: number;
  /** Set of log IDs that match highlight patterns */
  highlightedIds: Set<number>;
}

/**
 * Apply client-side include/exclude/highlight patterns to API results.
 * Returns the filtered list and highlight set.
 */
export function applyClientFilters(
  logs: LogEntryResponse[],
  preset: LogFilterPreset | null,
): ClientFilterResult {
  if (!preset) {
    return { filtered: logs, totalFromApi: logs.length, highlightedIds: new Set() };
  }

  const hasIncludes = preset.includePatterns.length > 0;
  const hasExcludes = preset.excludePatterns.length > 0;
  const hasHighlights = (preset.highlightPatterns?.length ?? 0) > 0;

  const filtered: LogEntryResponse[] = [];
  const highlightedIds = new Set<number>();

  for (const log of logs) {
    const text = logToSearchText(log);

    // Exclude takes priority
    if (hasExcludes && matchesAny(text, preset.excludePatterns)) continue;

    // Include filtering: must match at least one if patterns exist
    if (hasIncludes && !matchesAny(text, preset.includePatterns)) continue;

    filtered.push(log);

    if (hasHighlights && matchesAny(text, preset.highlightPatterns!)) {
      highlightedIds.add(log.id);
    }
  }

  return { filtered, totalFromApi: logs.length, highlightedIds };
}

// =============================================================================
// Built-in Presets
// =============================================================================

export const BUILTIN_PRESETS: LogFilterPreset[] = [
  {
    id: 'missing-provider-job-id',
    label: 'Missing Provider Job ID',
    description:
      'Debug PROCESSING generations stuck around submit/polling when provider_job_id is missing or a failed submit masks a previous valid submission.',
    apiFilters: {
      channel: 'pipeline',
      timeRange: '1h',
      limit: 500,
    },
    includePatterns: [
      'generation_submission_missing_provider_job_id',
      'generation_failed_unsubmitted_submission_error',
      'generation_poll_using_previous_valid_submission',
      'missing_provider_job_id_waiting',
      'provider_submission_created',
      'provider_execute_started',
      'provider_execute_returned',
      'provider_submission_updated',
      'provider_execute_failed',
    ],
    excludePatterns: [],
    highlightPatterns: [
      'generation_submission_missing_provider_job_id',
      'generation_failed_unsubmitted_submission_error',
      'generation_poll_using_previous_valid_submission',
    ],
  },
  {
    id: 'provider-concurrent-limit',
    label: 'Provider Concurrent Limit',
    description: 'Track queue capacity, concurrent slot exhaustion, and deferred jobs.',
    apiFilters: {
      channel: 'pipeline',
      timeRange: '15m',
      limit: 500,
    },
    includePatterns: [
      'concurrent',
      'capacity',
      'deferred',
      'queue_full',
      'slot_exhausted',
      'provider_execute_started',
      'provider_execute_returned',
      'provider_execute_failed',
    ],
    excludePatterns: [],
  },
  {
    id: 'content-filter-retry',
    label: 'Content Filter Retry',
    description: 'Find generations blocked by content filters and their retry attempts.',
    apiFilters: {
      channel: 'pipeline',
      timeRange: '6h',
      limit: 500,
    },
    includePatterns: [
      'content_filter',
      'content_moderation',
      'nsfw',
      'retry',
      'auto_retry',
      'generation_retry',
    ],
    excludePatterns: [],
  },
  {
    id: 'auth-session-failures',
    label: 'Auth / Session Failures',
    description: 'Track authentication errors, token rotation, and session issues.',
    apiFilters: {
      timeRange: '1h',
      level: 'ERROR',
      limit: 250,
    },
    includePatterns: [
      'auth',
      'token',
      'session',
      'unauthorized',
      '401',
      'credential',
      'login',
      'rotation',
    ],
    excludePatterns: [],
  },
  {
    id: 'worker-errors',
    label: 'Worker Errors',
    description: 'All worker-level errors for quick triage.',
    apiFilters: {
      service: 'worker',
      level: 'ERROR',
      timeRange: '1h',
      limit: 250,
    },
    includePatterns: [],
    excludePatterns: [],
  },
];
