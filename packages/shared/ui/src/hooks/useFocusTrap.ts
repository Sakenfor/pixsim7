import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export interface UseFocusTrapOptions {
  /** Whether the trap is active. */
  active: boolean;
  /** Ref to the container element to trap focus within. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * When the trap activates, move focus into the container if it isn't already.
   * Defaults to true.
   */
  autoFocus?: boolean;
  /**
   * When the trap deactivates, return focus to the previously focused element.
   * Defaults to true.
   */
  restoreFocus?: boolean;
}

/**
 * Trap Tab/Shift+Tab focus inside a container while active. Optionally moves
 * initial focus into the container and restores focus to the previously
 * focused element on deactivation.
 */
export function useFocusTrap({
  active,
  containerRef,
  autoFocus = true,
  restoreFocus = true,
}: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (autoFocus && !container.contains(document.activeElement)) {
      const focusable = getFocusable(container);
      const target = focusable[0] ?? container;
      target.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, autoFocus, restoreFocus]);
}
