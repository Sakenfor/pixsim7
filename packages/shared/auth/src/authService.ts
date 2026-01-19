/**
 * Authentication Service
 *
 * Handles login, logout, registration, and token management.
 *
 * Storage is abstracted via AuthStorageProvider for cross-platform support:
 * - Browser: localStorage (default)
 * - Desktop (Electron/Tauri): Can provide secure storage
 *
 * Usage:
 * ```ts
 * import { authService, setAuthStorageProvider, setTokenChangedCallback } from '@pixsim7/shared.auth';
 *
 * // Optional: Set callback for token changes (e.g., to sync with iframe)
 * setTokenChangedCallback((token) => {
 *   previewBridge.sendAuthToken(token);
 * });
 *
 * // Optional: Custom storage for desktop
 * setAuthStorageProvider(mySecureAuthStorage);
 * ```
 */
import type { PixSimApiClient } from '@pixsim7/shared.api-client';
import type { AuthStorageProvider } from './storage';
import { browserAuthStorage } from './storage';
import type { LoginRequest, RegisterRequest, AuthResponse, User } from './types';

// =============================================================================
// Configuration
// =============================================================================

/** Current auth storage provider (can be swapped for desktop) */
let authStorage: AuthStorageProvider = browserAuthStorage;

/** Optional callback when token changes (login, logout) */
let tokenChangedCallback: ((token: string | null) => void) | null = null;

/** Optional callback when logout occurs (for redirect handling) */
let logoutCallback: (() => void) | null = null;

/** API client instance (set via configureAuthService) */
let apiClient: PixSimApiClient | null = null;

/**
 * Configure the auth service with an API client.
 * Must be called before using auth operations.
 *
 * @param client - The PixSimApiClient instance to use for API calls
 */
export function configureAuthService(client: PixSimApiClient): void {
  apiClient = client;
}

/**
 * Set a custom auth storage provider (for desktop apps).
 * Call this before using authService.
 */
export function setAuthStorageProvider(provider: AuthStorageProvider): void {
  authStorage = provider;
}

/**
 * Get the current auth storage provider
 */
export function getAuthStorageProvider(): AuthStorageProvider {
  return authStorage;
}

/**
 * Set a callback that fires when the token changes (login/logout).
 * Use this to sync token with iframes, preview bridges, etc.
 *
 * @param callback - Called with token (string) on login, null on logout
 */
export function setTokenChangedCallback(callback: ((token: string | null) => void) | null): void {
  tokenChangedCallback = callback;
}

/**
 * Set a callback that fires when logout occurs.
 * Use this to handle redirects in the app layer.
 *
 * @param callback - Called when logout happens
 */
export function setLogoutCallback(callback: (() => void) | null): void {
  logoutCallback = callback;
}

// =============================================================================
// Auth Service
// =============================================================================

function getClient(): PixSimApiClient {
  if (!apiClient) {
    throw new Error(
      '[authService] API client not configured. Call configureAuthService(client) first.'
    );
  }
  return apiClient;
}

class AuthService {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const client = getClient();
    // Send either { email, password } or { username, password }
    const { email, username, password } = credentials;
    const identifier = email ?? username ?? '';
    const payload = { email: identifier, username: identifier, password };
    const response = await client.post<AuthResponse>('/auth/login', payload);

    if (response.access_token) {
      await this.saveAuth(response);
      tokenChangedCallback?.(response.access_token);
    }

    return response;
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    const client = getClient();
    const response = await client.post<AuthResponse>('/auth/register', userData);

    if (response.access_token) {
      await this.saveAuth(response);
      tokenChangedCallback?.(response.access_token);
    }

    return response;
  }

  async getCurrentUser(): Promise<User> {
    const client = getClient();
    return client.get<User>('/users/me');
  }

  async logout(): Promise<void> {
    await authStorage.clearAll();
    tokenChangedCallback?.(null);
    logoutCallback?.();
  }

  getStoredToken(): string | null {
    const result = authStorage.getAccessToken();
    // Handle sync case (browser localStorage)
    if (result instanceof Promise) {
      console.warn('[authService] Async storage not supported in sync getStoredToken');
      return null;
    }
    return result;
  }

  getStoredUser(): User | null {
    const result = authStorage.getUser();
    // Handle sync case (browser localStorage)
    if (result instanceof Promise) {
      console.warn('[authService] Async storage not supported in sync getStoredUser');
      return null;
    }
    return result;
  }

  /**
   * Async version of getStoredToken for desktop support
   */
  async getStoredTokenAsync(): Promise<string | null> {
    return authStorage.getAccessToken();
  }

  /**
   * Async version of getStoredUser for desktop support
   */
  async getStoredUserAsync(): Promise<User | null> {
    return authStorage.getUser();
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  /**
   * Async version of isAuthenticated for desktop support
   */
  async isAuthenticatedAsync(): Promise<boolean> {
    const token = await this.getStoredTokenAsync();
    return !!token;
  }

  private async saveAuth(authResponse: AuthResponse): Promise<void> {
    await authStorage.setAccessToken(authResponse.access_token);
    await authStorage.setUser(authResponse.user);
  }
}

/** Singleton auth service instance */
export const authService = new AuthService();
