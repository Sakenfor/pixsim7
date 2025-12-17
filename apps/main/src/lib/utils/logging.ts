/**
 * Simple web logger posting to backend ingestion API (batched).
 *
 * Usage:
 *   import { initWebLogger, logEvent } from '@lib/utils/logging';
 *   initWebLogger('frontend');
 *
 * Note: Uses raw fetch with `keepalive: true` to ensure logs are sent even
 * during page unload. The typed client (logs.ts) uses axios which doesn't
 * support keepalive, so we use types for validation but keep raw fetch.
 */

import { API_BASE_URL } from '../api/client';
import type { LogIngestRequest } from '../api/logs';

const getBackendUrl = (): string | undefined => {
  return API_BASE_URL;
};

let serviceName = 'web';

// In-memory batch queue and flush settings
// Use LogIngestRequest for type safety, but allow extra fields via intersection
type LogPayload = Partial<LogIngestRequest> & { level: string; service: string; msg: string };

const LOG_BATCH_SIZE = 10;
const LOG_FLUSH_INTERVAL_MS = 5000;
const LOG_MAX_QUEUE_SIZE = 1000;

const logQueue: LogPayload[] = [];
let flushTimer: number | undefined;

// Simple de-dupe for repeated identical errors in a short window
const DEDUPE_WINDOW_MS = 2000;
const MAX_COLLAPSE_BEFORE_SUMMARY = 10;
let lastKey: string | null = null;
let lastKeyTimestamp = 0;
let lastKeyRepeatCount = 0;

export function initWebLogger(service = 'web') {
  serviceName = service;
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e) => {
    const errorMessage = (e as ErrorEvent)?.error?.message || e.message || String(e);
    logEvent('ERROR', 'window_error', { error: errorMessage });
  });
  window.addEventListener('unhandledrejection', (e) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = (e as any)?.reason;
    logEvent('ERROR', 'unhandled_promise_rejection', { reason: String(reason) });
  });
}

function makeDedupeKey(
  level: string,
  msg: string,
  extra?: Record<string, unknown>
): string {
  const error = extra?.error ?? extra?.reason ?? '';
  return `${level}:${msg}:${String(error)}`;
}

function shouldDropForDedupe(
  level: string,
  msg: string,
  extra?: Record<string, unknown>
): boolean {
  const now = Date.now();
  const key = makeDedupeKey(level, msg, extra);

  if (key === lastKey && now - lastKeyTimestamp <= DEDUPE_WINDOW_MS) {
    lastKeyRepeatCount += 1;
    if (lastKeyRepeatCount < MAX_COLLAPSE_BEFORE_SUMMARY) {
      return true; // Drop duplicate
    }
    // Send a summary event and reset
    enqueueLog({
      level: 'WARNING',
      service: serviceName || 'frontend',
      env: 'dev',
      msg: 'log_event_collapsed',
      original_level: level,
      original_msg: msg,
      original_error: extra?.error ?? extra?.reason ?? null,
      occurrences: lastKeyRepeatCount + 1,
    });
    lastKey = null;
    lastKeyRepeatCount = 0;
    lastKeyTimestamp = now;
    return true;
  }

  // New key or outside window
  lastKey = key;
  lastKeyTimestamp = now;
  lastKeyRepeatCount = 0;
  return false;
}

function enqueueLog(payload: LogPayload) {
  if (logQueue.length >= LOG_MAX_QUEUE_SIZE) {
    // Drop oldest to avoid unbounded growth
    logQueue.shift();
  }
  logQueue.push(payload);

  if (logQueue.length >= LOG_BATCH_SIZE) {
    void flushLogs();
    return;
  }

  if (flushTimer === undefined && typeof window !== 'undefined') {
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      void flushLogs();
    }, LOG_FLUSH_INTERVAL_MS);
  }
}

async function flushLogs() {
  const base = getBackendUrl();
  if (!base || logQueue.length === 0) return;

  const batch = logQueue.splice(0, LOG_BATCH_SIZE * 2); // Flush up to 2x batch size
  try {
    await fetch(`${base}/logs/ingest/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
      keepalive: true,
    });
  } catch {
    // On failure, we drop the batch to avoid backpressure in the browser.
  }
}

export function logEvent(
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  msg: string,
  extra?: Record<string, unknown>
) {
  const base = getBackendUrl();
  if (!base) return;

  if (shouldDropForDedupe(level, msg, extra)) return;

  const payload: LogPayload = {
    level,
    service: serviceName || 'frontend',
    env: 'dev',
    msg,
    ...extra,
  };

  enqueueLog(payload);
}
