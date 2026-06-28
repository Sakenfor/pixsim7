/**
 * Environment-Neutral API Client
 *
 * Core HTTP client for PixSim7 API that works in any JavaScript environment.
 * Does not depend on browser-specific APIs (localStorage, window, DOM).
 */
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import type {
  ApiClientConfig,
  TokenProvider,
  ErrorResponse,
  VersionInfo,
} from './types';

/**
 * Per-request options for {@link PixSimApiClient.get}, extending the raw axios
 * config with the client's coalescing controls.
 */
export interface GetRequestConfig extends AxiosRequestConfig {
  /**
   * Force in-flight dedup on (`true`) or off (`false`) for this request,
   * overriding the client's `dedupGetsByDefault`. Dedup is **in-flight only**:
   * it collapses requests that overlap in time and drops the shared promise the
   * instant it settles — it never serves a cached response across time, so a
   * later read always re-fetches. Safe for idempotent reads.
   */
  dedup?: boolean;
  /**
   * Escape hatch when dedup is on-by-default: force a distinct request that
   * neither joins nor registers an in-flight share. Use for a read that must
   * reflect a write you just issued (read-after-write), which could otherwise
   * piggyback on an older in-flight read of the same URL. Ignored when `dedup`
   * is set explicitly.
   */
  fresh?: boolean;
  /**
   * Mark this as a user-initiated, latency-sensitive read so it BYPASSES the
   * global GET concurrency cap instead of queueing behind it. The cap (FIFO)
   * exists to stop background bursts — per-asset thumbnail polls + WS asset
   * refreshes — from stampeding a busy backend, but it also means an
   * interactive read (e.g. opening an asset's details) appended to the back of
   * a saturated queue can appear to hang until the slow background GETs ahead
   * of it clear. Priority reads are rare and user-paced, so letting them skip
   * the line (briefly over-subscribing the cap) is safe. Use sparingly — only
   * for reads a human is actively waiting on.
   */
  priority?: boolean;
}

function _generateCorrelationId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const rand = Math.floor(Math.random() * 16);
    const val = ch === 'x' ? rand : ((rand & 0x3) | 0x8);
    return val.toString(16);
  });
}

/**
 * API Client class for making requests to the PixSim7 backend.
 *
 * This client is environment-neutral and can be used in:
 * - Browser (with browser token provider)
 * - Node.js
 * - Electron
 * - Tauri
 *
 * @example
 * ```ts
 * import { createApiClient } from '@pixsim7/shared.api.client';
 * import { createBrowserTokenProvider } from '@pixsim7/shared.api.client/browser';
 *
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:8001',
 *   tokenProvider: createBrowserTokenProvider(),
 *   onUnauthorized: () => window.location.href = '/login',
 * });
 *
 * const assets = await client.get('/assets');
 * ```
 */
export class PixSimApiClient {
  private client: AxiosInstance;
  private tokenProvider: TokenProvider | undefined;
  private onUnauthorized: (() => void) | undefined;
  private readonly clientTraceId: string;

  // ── GET coalescing: in-flight dedup + global concurrency cap ──────────────
  // The cheapest request is the one never sent. `inFlightGets` lets concurrent
  // identical GETs share one round-trip (keyed by url+params); the slot
  // semaphore bounds how many distinct GETs hit the wire at once so a burst
  // can't stampede the backend. Both are GET-only — writes are never queued.
  private readonly maxConcurrentGets: number;
  private readonly dedupGetsByDefault: boolean;
  private readonly inFlightGets = new Map<string, Promise<unknown>>();
  private activeGets = 0;
  private readonly getQueue: Array<() => void> = [];

  /**
   * Flag to prevent multiple unauthorized callbacks.
   * Reset when a successful authenticated request is made.
   */
  private unauthorizedCallbackFired = false;

  constructor(config: ApiClientConfig) {
    const apiPath = config.apiPath ?? '/api/v1';
    const baseURL = `${config.baseUrl.replace(/\/$/, '')}${apiPath}`;

    this.tokenProvider = config.tokenProvider;
    this.onUnauthorized = config.onUnauthorized;
    this.clientTraceId = _generateCorrelationId();
    this.maxConcurrentGets = config.maxConcurrentGets ?? 0;
    this.dedupGetsByDefault = config.dedupGetsByDefault ?? false;

    this.client = axios.create({
      baseURL,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (requestConfig) => {
        requestConfig.headers = requestConfig.headers ?? {};
        if (!requestConfig.headers['X-Trace-ID']) {
          requestConfig.headers['X-Trace-ID'] = this.clientTraceId;
        }
        if (!requestConfig.headers['X-Request-ID']) {
          requestConfig.headers['X-Request-ID'] = _generateCorrelationId();
        }
        if (this.tokenProvider) {
          const token = await Promise.resolve(this.tokenProvider.getAccessToken());
          if (token) {
            requestConfig.headers.Authorization = `Bearer ${token}`;
          }
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // Reset the unauthorized flag on successful auth request
        this.unauthorizedCallbackFired = false;
        return response;
      },
      async (error: AxiosError<ErrorResponse>) => {
        if (error.response?.status === 401) {
          // Clear tokens if provider supports it
          if (this.tokenProvider?.clearTokens) {
            await Promise.resolve(this.tokenProvider.clearTokens());
          }

          // Call unauthorized handler (once per auth failure sequence)
          if (this.onUnauthorized && !this.unauthorizedCallbackFired) {
            this.unauthorizedCallbackFired = true;
            this.onUnauthorized();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the base URL of the API.
   */
  get baseURL(): string {
    return this.client.defaults.baseURL ?? '';
  }

  /**
   * Make a GET request.
   *
   * Subject to the client's GET coalescing: an optional global concurrency cap
   * (`maxConcurrentGets`) and optional in-flight dedup. Dedup is off unless
   * `dedupGetsByDefault` is set or `{ dedup: true }` is passed; `{ fresh: true }`
   * bypasses it. See {@link GetRequestConfig}.
   */
  async get<T>(url: string, config?: GetRequestConfig): Promise<T> {
    const { dedup, fresh, priority, ...axiosConfig } = config ?? {};
    const shouldDedup = dedup ?? (this.dedupGetsByDefault && !fresh);

    if (!shouldDedup) {
      return this._runCappedGet<T>(url, axiosConfig, priority);
    }

    const key = this._dedupKey(url, axiosConfig);
    const existing = this.inFlightGets.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = this._runCappedGet<T>(url, axiosConfig, priority).finally(() => {
      // In-flight only: drop the share the instant it settles so the next call
      // re-fetches rather than reusing a stale response across time.
      this.inFlightGets.delete(key);
    });
    this.inFlightGets.set(key, promise);
    return promise;
  }

  /** Run a GET under the global concurrency cap (no-op cap when unset). */
  private async _runCappedGet<T>(url: string, axiosConfig: AxiosRequestConfig, priority?: boolean): Promise<T> {
    await this._acquireGetSlot(priority);
    try {
      const response = await this.client.get<T>(url, axiosConfig);
      return response.data;
    } finally {
      this._releaseGetSlot();
    }
  }

  private _dedupKey(url: string, config: AxiosRequestConfig): string {
    // url + params is enough: auth/headers are session-constant, and a key miss
    // just costs one redundant request (safe), never a wrong response.
    const params = config.params ? JSON.stringify(config.params) : '';
    return `${url}?${params}`;
  }

  private _acquireGetSlot(priority?: boolean): Promise<void> {
    // Priority (user-initiated) reads skip the cap entirely so they never wait
    // behind a queue of slow background GETs. This can briefly push activeGets
    // above the cap; `_releaseGetSlot` lets it drain back down as requests
    // settle. Background reads stay capped/queued as before.
    if (priority || this.maxConcurrentGets <= 0 || this.activeGets < this.maxConcurrentGets) {
      this.activeGets++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.getQueue.push(resolve));
  }

  private _releaseGetSlot(): void {
    // Hand the freed slot straight to the next waiter (active count holds);
    // only decrement when nobody is queued.
    const next = this.getQueue.shift();
    if (next) next();
    else this.activeGets--;
  }

  /**
   * Make a POST request.
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a PUT request.
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a PATCH request.
   */
  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Make a DELETE request.
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  /**
   * Get the raw axios instance for special cases.
   * Use sparingly - prefer the typed methods above.
   */
  getRawClient(): AxiosInstance {
    return this.client;
  }

  /**
   * Get API version information.
   * Useful for client compatibility checks.
   */
  async getVersion(): Promise<VersionInfo> {
    // Version endpoint is at root, not under /api/v1
    const baseUrl = this.client.defaults.baseURL?.replace('/api/v1', '') ?? '';
    const response = await axios.get<VersionInfo>(`${baseUrl}/api/v1/version`);
    return response.data;
  }
}

/**
 * Create an API client instance.
 *
 * @param config - Client configuration
 * @returns Configured API client instance
 *
 * @example
 * ```ts
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:8001',
 *   tokenProvider: myTokenProvider,
 * });
 * ```
 */
export function createApiClient(config: ApiClientConfig): PixSimApiClient {
  return new PixSimApiClient(config);
}
