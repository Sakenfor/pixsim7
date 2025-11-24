/**
 * Page Tracking Hook
 *
 * Manages favorites and recent pages using localStorage
 */

import { useState, useEffect, useCallback } from 'react';

const FAVORITES_KEY = 'pixsim7:favorites';
const RECENT_PAGES_KEY = 'pixsim7:recent-pages';
const MAX_RECENT_PAGES = 5;

export interface PageInfo {
  id: string;
  name: string;
  route: string;
  icon: string;
  iconColor?: string;
  timestamp?: number;
}

export function usePageTracking() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentPages, setRecentPages] = useState<PageInfo[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedFavorites = localStorage.getItem(FAVORITES_KEY);
      if (savedFavorites) {
        setFavorites(JSON.parse(savedFavorites));
      }

      const savedRecent = localStorage.getItem(RECENT_PAGES_KEY);
      if (savedRecent) {
        setRecentPages(JSON.parse(savedRecent));
      }
    } catch (error) {
      console.warn('Failed to load page tracking data:', error);
    }
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback((pageId: string) => {
    setFavorites(prev => {
      const newFavorites = prev.includes(pageId)
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId];

      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      } catch (error) {
        console.warn('Failed to save favorites:', error);
      }

      return newFavorites;
    });
  }, []);

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
        localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(newRecent));
      } catch (error) {
        console.warn('Failed to save recent pages:', error);
      }

      return newRecent;
    });
  }, []);

  // Clear recent pages
  const clearRecent = useCallback(() => {
    setRecentPages([]);
    try {
      localStorage.removeItem(RECENT_PAGES_KEY);
    } catch (error) {
      console.warn('Failed to clear recent pages:', error);
    }
  }, []);

  return {
    favorites,
    recentPages,
    toggleFavorite,
    isFavorite,
    addToRecent,
    clearRecent,
  };
}
