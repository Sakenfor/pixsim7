/**
 * Dev Tool Context
 *
 * Provides context and utilities for dev tools including:
 * - Recent tools tracking
 * - Quick access modal state
 * - Global dev tool state
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { DevToolId } from './types';

const RECENT_TOOLS_KEY = 'dev-tools-recent';
const MAX_RECENT_TOOLS = 5;

export interface DevToolContextValue {
  /** Recently opened dev tools */
  recentTools: DevToolId[];

  /** Add a tool to recent tools */
  addRecentTool: (toolId: DevToolId) => void;

  /** Clear recent tools */
  clearRecentTools: () => void;

  /** Quick access modal state */
  isQuickAccessOpen: boolean;

  /** Open quick access modal */
  openQuickAccess: () => void;

  /** Close quick access modal */
  closeQuickAccess: () => void;

  /** Toggle quick access modal */
  toggleQuickAccess: () => void;
}

const DevToolContext = createContext<DevToolContextValue | null>(null);

export interface DevToolProviderProps {
  children: ReactNode;
}

export function DevToolProvider({ children }: DevToolProviderProps) {
  const [recentTools, setRecentTools] = useState<DevToolId[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_TOOLS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [isQuickAccessOpen, setIsQuickAccessOpen] = useState(false);

  // Persist recent tools to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(recentTools));
    } catch (error) {
      console.error('[DevToolContext] Failed to persist recent tools:', error);
    }
  }, [recentTools]);

  const addRecentTool = useCallback((toolId: DevToolId) => {
    setRecentTools((prev) => {
      // Remove existing entry if present
      const filtered = prev.filter((id) => id !== toolId);
      // Add to front, limit to MAX_RECENT_TOOLS
      return [toolId, ...filtered].slice(0, MAX_RECENT_TOOLS);
    });
  }, []);

  const clearRecentTools = useCallback(() => {
    setRecentTools([]);
  }, []);

  const openQuickAccess = useCallback(() => {
    setIsQuickAccessOpen(true);
  }, []);

  const closeQuickAccess = useCallback(() => {
    setIsQuickAccessOpen(false);
  }, []);

  const toggleQuickAccess = useCallback(() => {
    setIsQuickAccessOpen((prev) => !prev);
  }, []);

  const value: DevToolContextValue = {
    recentTools,
    addRecentTool,
    clearRecentTools,
    isQuickAccessOpen,
    openQuickAccess,
    closeQuickAccess,
    toggleQuickAccess,
  };

  return <DevToolContext.Provider value={value}>{children}</DevToolContext.Provider>;
}

/**
 * Hook to access dev tool context
 */
export function useDevToolContext(): DevToolContextValue {
  const context = useContext(DevToolContext);
  if (!context) {
    throw new Error('useDevToolContext must be used within a DevToolProvider');
  }
  return context;
}
