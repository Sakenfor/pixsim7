// Simple web logger posting to backend ingestion API
// Usage: import { initWebLogger, logEvent } from '@/lib/logging'; initWebLogger('frontend');

const getBackendUrl = (): string | undefined => {
  return (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
};

let serviceName = 'web';

export function initWebLogger(service = 'web') {
  serviceName = service;
  window.addEventListener('error', (e) => {
    logEvent('ERROR', 'window_error', { error: e?.error?.message || e.message || String(e) });
  });
  window.addEventListener('unhandledrejection', (e) => {
    logEvent('ERROR', 'unhandled_promise_rejection', { reason: String((e as any).reason) });
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
    await fetch(`${base}/api/v1/logs/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, service: serviceName || 'frontend', env: 'dev', msg, ...extra }),
      keepalive: true,
    });
  } catch {}
}
