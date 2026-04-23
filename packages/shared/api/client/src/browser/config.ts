/**
 * Browser Configuration Helpers
 *
 * Utilities for configuring the API client in browser environments.
 */

/**
 * Options for computing the backend URL.
 */
export interface ComputeBackendUrlOptions {
  /**
   * Environment variable value for backend URL (e.g., VITE_BACKEND_URL).
   */
  envUrl?: string;

  /**
   * Default port to use when inferring from window.location.
   * @default 8000
   */
  defaultPort?: number;

  /**
   * Fallback URL if all other methods fail.
   * @default 'http://localhost:8000'
   */
  fallbackUrl?: string;
}

/**
 * Compute the backend base URL for browser environments.
 *
 * Resolution order:
 * 1. Sentinel "relative" (or literal empty string in envUrl) → return "" so API
 *    calls go to the same origin as the page. Use with a dev-server or prod
 *    proxy that routes /api/... to the right backend.
 * 2. Explicit environment variable (envUrl) — absolute URL.
 * 3. Infer from window.location (same host, different port).
 * 4. Fallback URL.
 *
 * @example
 * ```ts
 * // Frontend relies on a proxy in front (Vite dev-server or Caddy):
 * //   VITE_BACKEND_URL=""  (or "relative")
 * const baseUrl = computeBackendUrl({ envUrl: import.meta.env.VITE_BACKEND_URL });
 * // Returns: ""  — every fetch becomes same-origin relative.
 *
 * // Direct absolute backend (no proxy):
 * //   VITE_BACKEND_URL="http://localhost:8000"
 * const baseUrl = computeBackendUrl({ envUrl: import.meta.env.VITE_BACKEND_URL });
 * ```
 */
export function computeBackendUrl(options: ComputeBackendUrlOptions = {}): string {
  const { envUrl, defaultPort = 8000, fallbackUrl = 'http://localhost:8000' } = options;

  // 1. Relative-mode sentinel: empty-string env var, or literal "relative".
  // Must be checked before the truthy `envUrl` branch below since "" is falsy.
  if (envUrl !== undefined && (envUrl === '' || envUrl.trim().toLowerCase() === 'relative')) {
    return '';
  }

  // 2. Use environment variable if provided (absolute URL)
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  // 3. Infer from window.location if available
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${defaultPort}`;
  }

  // 4. Fallback
  return fallbackUrl;
}

/**
 * Compute the WebSocket URL from a backend URL.
 *
 * - If `baseUrl` is a full http(s):// URL: convert scheme to ws(s):// and append path.
 * - If `baseUrl` is empty (relative mode): derive ws(s):// + host from window.location.
 *
 * @example
 * ```ts
 * computeWebSocketUrl('http://localhost:8001', '/ws/events');
 * // → 'ws://localhost:8001/ws/events'
 *
 * computeWebSocketUrl('', '/ws/events');  // relative mode, running under https page
 * // → 'wss://<page-host>/ws/events'
 * ```
 */
export function computeWebSocketUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    if (typeof window !== 'undefined' && window.location) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${wsProtocol}://${window.location.host}${path}`;
    }
    // Non-browser caller in relative mode — return path alone and let caller handle it.
    return path;
  }
  const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const httpUrl = baseUrl.replace(/^https?/, wsProtocol);
  return `${httpUrl}${path}`;
}
