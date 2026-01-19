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

import { pixsimClient } from '../api/client';
import { previewBridge } from '../preview-bridge';

// Configure the auth service with the API client
configureAuthService(pixsimClient);

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
