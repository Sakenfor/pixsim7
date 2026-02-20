import { createApiClient } from '@pixsim7/shared.api.client';
import { computeBackendUrl } from '@pixsim7/shared.api.client/browser';
import { getAuthTokenProvider } from '@pixsim7/shared.auth.core';

export const BACKEND_BASE = computeBackendUrl({
  envUrl: import.meta.env.VITE_BACKEND_URL as string | undefined,
  defaultPort: 8000,
  fallbackUrl: 'http://localhost:8000',
});

let isRedirecting = false;

export const pixsimClient = createApiClient({
  baseUrl: BACKEND_BASE,
  tokenProvider: getAuthTokenProvider(),
  onUnauthorized: () => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!window.location.pathname.startsWith('/login') && !isRedirecting) {
      isRedirecting = true;
      window.location.href = '/login';
    }
  },
});
