import type { AxiosRequestConfig } from 'axios';

import { pixsimClient } from '../lib/api/client';

/**
 * Minimal API hook for devtools routes.
 */
export function useApi() {
  return {
    get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.get<T>(url, config),
    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.post<T>(url, data, config),
    put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.put<T>(url, data, config),
    patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.patch<T>(url, data, config),
    delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> =>
      pixsimClient.delete<T>(url, config),
  };
}
