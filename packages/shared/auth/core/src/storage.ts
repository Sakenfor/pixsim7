/**
 * Auth Storage Provider
 *
 * Abstraction for token and user storage, enabling cross-platform support.
 * - Browser: localStorage (default)
 * - Desktop (Electron/Tauri): Can provide secure OS keychain storage
 */

import type { User } from './types';

/** Token storage key (localStorage) */
export const TOKEN_KEY = 'access_token';

/** User storage key (localStorage) */
export const USER_KEY = 'user';

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
export const browserAuthStorage: AuthStorageProvider = {
  getAccessToken: () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  setAccessToken: (token) => {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  getUser: () => {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem(USER_KEY);
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
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  },
  clearAll: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
