/**
 * Authentication Service - App Configuration
 *
 * This module configures the shared auth service with app-specific settings:
 * - API client integration
 * - Preview bridge token sync
 * - Logout redirect handling
 *
 * Re-exports the configured authService from @pixsim7/shared.auth.
 */
import {
  authService,
  configureAuthService,
  setTokenChangedCallback,
  setLogoutCallback,
  setAuthStorageProvider,
  getAuthStorageProvider,
  type AuthStorageProvider,
} from '@pixsim7/shared.auth';

import { BACKEND_BASE } from '../api/client';
import { previewBridge } from '../preview-bridge';

let isRedirecting = false;

// Configure the auth service with API client settings
configureAuthService({
  baseUrl: BACKEND_BASE,
  onUnauthorized: () => {
    if (typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith('/login') && !isRedirecting) {
      isRedirecting = true;
      window.location.href = '/login';
    }
  },
});

// Hook into token changes for preview bridge sync
setTokenChangedCallback((token) => {
  previewBridge.sendAuthToken(token);
});

// Handle logout redirects
setLogoutCallback(() => {
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
});

// Re-export the configured service and types
export {
  authService,
  setAuthStorageProvider,
  getAuthStorageProvider,
  type AuthStorageProvider,
};
