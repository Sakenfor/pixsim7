// Simple web logger posting to backend ingestion API (batched).
// Usage: import { initWebLogger, logEvent } from './lib/logging'; initWebLogger('game_frontend');

const getBackendUrl = (): string | undefined => {
  // VITE_BACKEND_URL should be the backend base (no /api/v1)
  return (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
};

let serviceName = 'web';

type LogPayload = Record<string, unknown>;

const LOG_BATCH_SIZE = 10;
const LOG_FLUSH_INTERVAL_MS = 5000;
const LOG_MAX_QUEUE_SIZE = 1000;

const logQueue: LogPayload[] = [];
let flushTimer: number | undefined;

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
      return true;
    }
    enqueueLog({
      level: 'WARNING',
      service: serviceName || 'game_frontend',
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

  lastKey = key;
  lastKeyTimestamp = now;
  lastKeyRepeatCount = 0;
  return false;
}

function enqueueLog(payload: LogPayload) {
  if (logQueue.length >= LOG_MAX_QUEUE_SIZE) {
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

  const apiBase = `${base.replace(/\/$/, '')}/api/v1`;
  const batch = logQueue.splice(0, LOG_BATCH_SIZE * 2);
  try {
    await fetch(`${apiBase}/logs/ingest/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: batch }),
      keepalive: true,
    });
  } catch {
    // Drop batch on failure to avoid backpressure
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
    service: serviceName || 'game_frontend',
    env: 'dev',
    msg,
    ...extra,
  };

  enqueueLog(payload);
}
