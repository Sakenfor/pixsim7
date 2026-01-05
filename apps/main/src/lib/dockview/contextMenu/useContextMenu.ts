/**
 * Context Menu Hooks
 *
 * Hooks for accessing context menu functionality.
 * Separated from ContextMenuProvider for fast-refresh compatibility.
 */

import { useContext } from 'react';

import { ContextMenuContext } from './ContextMenuContext';

/**
 * Hook to access context menu functionality
 *
 * @throws Error if used outside of ContextMenuProvider
 */
export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

/**
 * Hook to check if context menu is available (optional usage)
 *
 * Returns null if outside provider, allowing components to work
 * with or without context menu support.
 */
export function useContextMenuOptional() {
  return useContext(ContextMenuContext);
}
