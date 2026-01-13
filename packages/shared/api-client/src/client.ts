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
 * import { createApiClient } from '@pixsim7/shared.api-client';
 * import { createBrowserTokenProvider } from '@pixsim7/shared.api-client/browser';
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
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
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
