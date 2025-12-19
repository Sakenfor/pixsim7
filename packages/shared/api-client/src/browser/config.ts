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
 * 1. Explicit environment variable (envUrl)
 * 2. Infer from window.location (same host, different port)
 * 3. Fallback URL
 *
 * @param options - Configuration options
 * @returns The computed backend URL
 *
 * @example
 * ```ts
 * // With Vite
 * const baseUrl = computeBackendUrl({
 *   envUrl: import.meta.env.VITE_BACKEND_URL,
 * });
 *
 * // With custom port
 * const baseUrl = computeBackendUrl({
 *   defaultPort: 8001,
 * });
 * ```
 */
export function computeBackendUrl(options: ComputeBackendUrlOptions = {}): string {
  const { envUrl, defaultPort = 8000, fallbackUrl = 'http://localhost:8000' } = options;

  // 1. Use environment variable if provided
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  // 2. Infer from window.location if available
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${defaultPort}`;
  }

  // 3. Fallback
  return fallbackUrl;
}

/**
 * Compute the WebSocket URL from a backend URL.
 *
 * Converts http/https to ws/wss and appends the path.
 *
 * @param baseUrl - The HTTP base URL
 * @param path - WebSocket path (e.g., '/ws')
 * @returns The WebSocket URL
 *
 * @example
 * ```ts
 * const wsUrl = computeWebSocketUrl('http://localhost:8001', '/ws/events');
 * // Returns: 'ws://localhost:8001/ws/events'
 * ```
 */
export function computeWebSocketUrl(baseUrl: string, path: string): string {
  const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const httpUrl = baseUrl.replace(/^https?/, wsProtocol);
  return `${httpUrl}${path}`;
}
