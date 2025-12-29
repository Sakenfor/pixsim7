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
 * // Browser (default)
 * import { authService } from './authService';
 *
 * // Desktop with custom storage
 * import { setAuthStorageProvider } from './authService';
 * setAuthStorageProvider(mySecureAuthStorage);
 * ```
 */
import { apiClient } from '../api/client';
import { previewBridge } from '../preview-bridge';
import type { LoginRequest, RegisterRequest, AuthResponse, User } from '../../types';

// =============================================================================
// Auth Storage Provider (for cross-platform support)
// =============================================================================

/**
 * Auth storage provider interface for cross-platform token/user storage.
 *
 * Extends the TokenProvider pattern to include user data storage.
 * Default: localStorage (browser)
 * Desktop apps can provide secure storage (OS keychain, encrypted file, etc.)
 */
export interface AuthStorageProvider {
  /** Get the stored access token */
  getAccessToken(): string | null | Promise<string | null>;
  /** Set the access token (null to clear) */
  setAccessToken(token: string | null): void | Promise<void>;
  /** Get the stored user data */
  getUser(): User | null | Promise<User | null>;
  /** Set the user data (null to clear) */
  setUser(user: User | null): void | Promise<void>;
  /** Clear all auth data (logout) */
  clearAll(): void | Promise<void>;
}

/**
 * Default browser storage using localStorage
 */
const browserAuthStorage: AuthStorageProvider = {
  getAccessToken: () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  },
  setAccessToken: (token) => {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  },
  getUser: () => {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },
  setUser: (user) => {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  },
  clearAll: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },
};

/**
 * Current auth storage provider (can be swapped for desktop)
 */
let authStorage: AuthStorageProvider = browserAuthStorage;

/**
 * Set a custom auth storage provider (for desktop apps)
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

// =============================================================================
// Auth Service
// =============================================================================

class AuthService {
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    // Send either { email, password } or { username, password }
    const { email, username, password } = credentials;
    const identifier = email ?? username ?? '';
    const payload = { email: identifier, username: identifier, password };
    const response = await apiClient.post<AuthResponse>('/auth/login', payload);

    if (response.data.access_token) {
      await this.saveAuth(response.data);
      previewBridge.sendAuthToken(response.data.access_token);
    }

    return response.data;
  }

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', userData);

    if (response.data.access_token) {
      await this.saveAuth(response.data);
      previewBridge.sendAuthToken(response.data.access_token);
    }

    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  }

  async logout(): Promise<void> {
    await authStorage.clearAll();
    previewBridge.sendAuthToken(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
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

export const authService = new AuthService();
