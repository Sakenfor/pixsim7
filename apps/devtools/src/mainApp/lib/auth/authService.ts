import {
  authService,
  configureAuthService,
  setLogoutCallback,
  setAuthStorageProvider,
  getAuthStorageProvider,
  type AuthStorageProvider,
} from '@pixsim7/shared.auth.core';

import { BACKEND_BASE } from '../api/client';

let isRedirecting = false;

configureAuthService({
  baseUrl: BACKEND_BASE,
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

setLogoutCallback(() => {
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
});

export {
  authService,
  setAuthStorageProvider,
  getAuthStorageProvider,
  type AuthStorageProvider,
};
