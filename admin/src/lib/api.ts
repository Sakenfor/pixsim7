// Simple API helper for admin debug tools
export interface ApiOptions {
  method?: string;
  body?: any;
  token?: string;
}

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

function buildUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // Ensure single slash join
  return `${BACKEND_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function api(path: string, options: ApiOptions = {}) {
  const { method = 'GET', body, token } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = buildUrl(path);
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function setBackendBase(base: string) {
  // Runtime override if needed
  (globalThis as any).__PIX_BACKEND_BASE = base;
}
