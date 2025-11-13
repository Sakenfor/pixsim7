// Simple web logger posting to backend ingestion API
// Usage: import { initWebLogger, logEvent } from '$lib/logging'; initWebLogger('admin');

const getBackendUrl = (): string | undefined => {
  return (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
};

let serviceName = 'web';

export function initWebLogger(service = 'web') {
  serviceName = service;
  // Global error handlers
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
  if (!base) return; // No backend URL configured
  try {
    await fetch(`${base}/api/v1/logs/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        service: 'admin',
        env: (window as any).PIXSIM_ENV || 'dev',
        msg,
        ...extra,
      }),
      keepalive: true,
    });
  } catch {
    // swallow
  }
}
