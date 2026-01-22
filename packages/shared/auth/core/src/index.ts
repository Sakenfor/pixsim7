/**
 * @pixsim7/shared.auth.core
 *
 * Shared authentication logic for PixSim7.
 * Provides login, logout, registration, and token management.
 *
 * @example Setup (in your app's entry point)
 * ```ts
 * import { computeBackendUrl } from '@pixsim7/shared.api.client/browser';
 * import { configureAuthService, setTokenChangedCallback, setLogoutCallback } from '@pixsim7/shared.auth.core';
 *
 * configureAuthService({
 *   baseUrl: computeBackendUrl({ envUrl: import.meta.env.VITE_BACKEND_URL }),
 *   onUnauthorized: () => window.location.href = '/login',
 * });
 *
 * // Optional: Hook into token changes
 * setTokenChangedCallback((token) => {
 *   previewBridge.sendAuthToken(token);
 * });
 *
 * // Optional: Handle logout redirects
 * setLogoutCallback(() => {
 *   window.location.href = '/login';
 * });
 * ```
 *
 * @example Using auth in components
 * ```tsx
 * import { useAuthStore, authService } from '@pixsim7/shared.auth.core';
 *
 * function LoginPage() {
 *   const setUser = useAuthStore((s) => s.setUser);
 *
 *   const handleLogin = async (email: string, password: string) => {
 *     const response = await authService.login({ email, password });
 *     setUser(response.user);
 *   };
 * }
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from './types';

// Config
export type { AuthServiceConfig } from './authService';

// Storage
export type { AuthStorageProvider } from './storage';
export {
  browserAuthStorage,
  TOKEN_KEY,
  USER_KEY,
} from './storage';

// Service
export {
  authService,
  configureAuthService,
  getAuthTokenProvider,
  setAuthStorageProvider,
  getAuthStorageProvider,
  setTokenChangedCallback,
  setLogoutCallback,
} from './authService';

// Store
export { useAuthStore, type AuthState } from './authStore';
