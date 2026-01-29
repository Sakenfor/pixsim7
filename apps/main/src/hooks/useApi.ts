import type { AxiosRequestConfig } from 'axios';
import { pixsimClient } from '../lib/api/client';

/**
 * Minimal API hook for dev tools and simple views.
 *
 * Wraps the shared pixsimClient for use in React components.
 * Extend with put/patch/delete as needed.
 */
export function useApi() {
  return {
    get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.get<T>(url, config),
    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.post<T>(url, data, config),
  };
}

