// Simple web logger posting to backend ingestion API
// Usage: import { initWebLogger, logEvent } from '@/lib/logging'; initWebLogger('frontend');

import { API_BASE_URL } from './api/client';

const getBackendUrl = (): string | undefined => {
  return API_BASE_URL;
};

let serviceName = 'web';

export function initWebLogger(service = 'web') {
  serviceName = service;
  window.addEventListener('error', (e) => {
    logEvent('ERROR', 'window_error', { error: e?.error?.message || e.message || String(e) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    logEvent('ERROR', 'unhandled_promise_rejection', { reason: String(e.reason) });
  });
}

export async function logEvent(
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  msg: string,
  extra?: Record<string, unknown>
) {
  const base = getBackendUrl();
  if (!base) return;
  try {
    await fetch(`${base}/logs/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, service: serviceName || 'frontend', env: 'dev', msg, ...extra }),
      keepalive: true,
    });
  } catch {}
}
