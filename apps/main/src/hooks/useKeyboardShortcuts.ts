/**
 * Keyboard Shortcuts Hook
 *
 * Provides a declarative way to register keyboard shortcuts.
 */

import { useEffect, useRef } from 'react';

/**
 * True when the keyboard event originated from an editable target
 * (input, textarea, or contenteditable). Exported so ad-hoc listeners
 * outside the capability registry can share the same gate instead of
 * re-implementing it (often partially — e.g. forgetting contenteditable).
 */
export function isTypingInEditable(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
  );
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  callback: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
}

/**
 * Hook for registering keyboard shortcuts
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.key) return;
      // Skip bare-key / shift-only shortcuts while typing. Ctrl/Alt/Meta
      // combos still fire (e.g. Ctrl+G for quick-generate) because the
      // user explicitly chose a modifier; shift alone is ambiguous with
      // typing uppercase/symbols so we treat it as unmodified here.
      const isTyping = isTypingInEditable(event);

      for (const shortcut of shortcutsRef.current) {
        if (!shortcut.key) continue;
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey;
        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatches = shortcut.alt ? event.altKey : !event.altKey;
        const metaMatches = shortcut.meta ? event.metaKey : true;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches) {
          const hasExplicitModifier = !!(shortcut.ctrl || shortcut.alt || shortcut.meta);
          if (isTyping && !hasExplicitModifier) continue;
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.callback(event);
          break; // Only trigger first matching shortcut
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

/**
 * Hook for showing keyboard shortcut help
 */
export function useShortcutHelp(shortcuts: KeyboardShortcut[]) {
  return shortcuts.map(s => ({
    keys: [
      s.ctrl && 'Ctrl',
      s.shift && 'Shift',
      s.alt && 'Alt',
      s.meta && 'Cmd',
      s.key.toUpperCase(),
    ].filter(Boolean).join(' + '),
    description: s.description || '',
  }));
}
