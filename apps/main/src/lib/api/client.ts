import axios, { AxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

// Build backend base URL similar to admin app: prefer VITE_BACKEND_URL, else infer from location, fallback to 8001
function computeBackendUrl(): string {
  const envUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
  console.log('[DEBUG] VITE_BACKEND_URL:', envUrl);
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8000`;
  }
  return 'http://localhost:8000';
}

export const BACKEND_BASE = computeBackendUrl();
export const API_BASE_URL = `${BACKEND_BASE}/api/v1`;

/**
 * API Client with centralized 401 handling.
 *
 * **Invariant**: At most one redirect to /login is allowed at a time.
 * This prevents "redirect storms" and login flash effects when multiple
 * parallel API requests fail with 401.
 *
 * The redirect guard ensures:
 * - Only one redirect happens even if multiple 401s occur simultaneously
 * - No redirect if already on /login page
 * - Redirect flag is never reset (single redirect per page load)
 */
class ApiClient {
  private client: AxiosInstance;

  /**
   * Static flag to prevent multiple redirects to /login.
   *
   * Once set to true, remains true for the lifetime of the page.
   * This ensures parallel 401 responses only trigger one redirect.
   */
  private static isRedirecting = false;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    /**
     * Response interceptor for centralized error handling.
     *
     * **401 Unauthorized Handling**:
     * When a 401 response is received, redirect to /login page.
     * The redirect guard ensures:
     * 1. No redirect if already on /login (prevents infinite loops)
     * 2. Only one redirect per page load (prevents "login flash" from parallel 401s)
     *
     * **Invariant**: window.location.href = '/login' is called at most once per page load
     */
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - redirect once (prevent flash loops from parallel requests)
          if (!window.location.pathname.startsWith('/login') && !ApiClient.isRedirecting) {
            ApiClient.isRedirecting = true;
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.get<T>(url, config);
  }

  post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.post<T>(url, data, config);
  }

  put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.put<T>(url, data, config);
  }

  patch<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.delete<T>(url, config);
  }

  // Direct access to axios instance for special cases
  getRawClient() {
    return this.client;
  }
}

export const apiClient = new ApiClient();
