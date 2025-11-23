/**
 * Dev Tool Shortcuts Hook
 *
 * Provides keyboard shortcuts for quick access to dev tools.
 */

import { useEffect } from 'react';
import { useDevToolContext } from '../lib/devtools/devToolContext';

/**
 * Keyboard shortcuts for dev tools:
 * - Ctrl+Shift+D: Toggle quick access modal
 * - Ctrl+Shift+T: Open dev tools panel
 */
export function useDevToolShortcuts() {
  const { toggleQuickAccess } = useDevToolContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+D or Cmd+Shift+D - Toggle quick access
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        toggleQuickAccess();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleQuickAccess]);
}
