/**
 * Context Menu Hooks
 */

import { useContext } from 'react';
import { ContextMenuContext } from './ContextMenuContext';

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

export function useContextMenuOptional() {
  return useContext(ContextMenuContext);
}
