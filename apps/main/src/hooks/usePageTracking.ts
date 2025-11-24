/**
 * Page Tracking Hook
 *
 * Manages favorites and recent pages using localStorage
 * Supports per-user storage scoping via userId parameter
 */

import { useState, useEffect, useCallback } from 'react';

const MAX_RECENT_PAGES = 5;

export interface PageInfo {
  id: string;
  name: string;
  route: string;
  icon: string;
  iconColor?: string;
  timestamp?: number;
}

export interface UsePageTrackingOptions {
  /**
   * User identifier for scoping storage
   * If not provided, uses a default 'guest' prefix
   */
  userId?: string;
}

/**
 * Generate storage keys scoped to a user
 */
function getStorageKeys(userId?: string) {
  const prefix = userId ? `pixsim7:user:${userId}` : 'pixsim7:guest';
  return {
    favorites: `${prefix}:favorites`,
    recentPages: `${prefix}:recent-pages`,
  };
}

/**
 * Safely parse JSON from localStorage with validation
 */
function safeParseArray<T>(value: string | null, validator: (data: unknown) => data is T[]): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (validator(parsed)) {
      return parsed;
    }
    console.warn('Invalid data format in localStorage, resetting to empty array');
    return [];
  } catch (error) {
    console.warn('Failed to parse localStorage data:', error);
    return [];
  }
}

/**
 * Validate that data is an array of strings (for favorites)
 */
function isStringArray(data: unknown): data is string[] {
  return Array.isArray(data) && data.every(item => typeof item === 'string');
}

/**
 * Validate that data is an array of PageInfo objects (for recent pages)
 */
function isPageInfoArray(data: unknown): data is PageInfo[] {
  return (
    Array.isArray(data) &&
    data.every(
      item =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'name' in item &&
        'route' in item &&
        'icon' in item
    )
  );
}

export function usePageTracking(options?: UsePageTrackingOptions) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentPages, setRecentPages] = useState<PageInfo[]>([]);

  const storageKeys = getStorageKeys(options?.userId);

  // Load from localStorage on mount or when userId changes
  useEffect(() => {
    const savedFavorites = localStorage.getItem(storageKeys.favorites);
    const parsedFavorites = safeParseArray(savedFavorites, isStringArray);
    setFavorites(parsedFavorites);

    const savedRecent = localStorage.getItem(storageKeys.recentPages);
    const parsedRecent = safeParseArray(savedRecent, isPageInfoArray);
    setRecentPages(parsedRecent);
  }, [storageKeys.favorites, storageKeys.recentPages]);

  // Toggle favorite
  const toggleFavorite = useCallback((pageId: string) => {
    setFavorites(prev => {
      const newFavorites = prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId];

      try {
        localStorage.setItem(storageKeys.favorites, JSON.stringify(newFavorites));
      } catch (error) {
        console.warn('Failed to save favorites:', error);
      }

      return newFavorites;
    });
  }, [storageKeys.favorites]);

  // Check if page is favorited
  const isFavorite = useCallback((pageId: string) => {
    return favorites.includes(pageId);
  }, [favorites]);

  // Add to recent pages
  const addToRecent = useCallback((page: Omit<PageInfo, 'timestamp'>) => {
    setRecentPages(prev => {
      // Remove if already exists
      const filtered = prev.filter(p => p.id !== page.id);

      // Add to front with timestamp
      const newRecent = [
        { ...page, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENT_PAGES);

      try {
        localStorage.setItem(storageKeys.recentPages, JSON.stringify(newRecent));
      } catch (error) {
        console.warn('Failed to save recent pages:', error);
      }

      return newRecent;
    });
  }, [storageKeys.recentPages]);

  // Clear recent pages
  const clearRecent = useCallback(() => {
    setRecentPages([]);
    try {
      localStorage.removeItem(storageKeys.recentPages);
    } catch (error) {
      console.warn('Failed to clear recent pages:', error);
    }
  }, [storageKeys.recentPages]);

  return {
    favorites,
    recentPages,
    toggleFavorite,
    isFavorite,
    addToRecent,
    clearRecent,
  };
}
