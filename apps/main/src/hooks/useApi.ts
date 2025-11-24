import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '../lib/api/client';

/**
 * Minimal API hook for dev tools and simple views.
 *
 * Wraps the shared apiClient and returns response data directly.
 * Extend with post/put/patch/delete as needed.
 */
export function useApi() {
  return {
    async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
      const response = await apiClient.get<T>(url, config);
      return response.data;
    },
  };
}

