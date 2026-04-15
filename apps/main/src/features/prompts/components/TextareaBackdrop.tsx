/**
 * TextareaBackdrop — shared clip + scroll-sync primitive for overlays rendered
 * behind a transparent textarea.
 *
 * Consumers (ShadowTextarea, PromptGhostDiff) pass the textarea ref and the
 * backdrop content as children.  This component handles:
 *
 *   1. Positioning (absolute inset-0, matches textarea bounds)
 *   2. Clip/overflow hidden on outer wrapper
 *   3. Scroll sync — direct DOM transform mutation, no React state (avoids
 *      the 1–2 frame lag you get from rAF + setState + re-render during
 *      rapid scroll)
 *   4. Scrollbar width compensation via padding-right on inner content
 *   5. Font metric copying — reads the textarea's computed style and applies
 *      matching font-family, font-size, line-height, letter-spacing,
 *      word-spacing, tab-size to the inner content.  This guarantees both
 *      layers wrap lines at identical positions.  Without this step, the
 *      textarea's browser-default font diverges from the parent document
 *      font and highlights drift at different y-coordinates.
 *
 * Children should use `text-transparent` on any span that needs to occupy
 * space but not visually render its text.
 */

import clsx from 'clsx';
import { useLayoutEffect, useRef } from 'react';

export interface TextareaBackdropProps {
  /** Ref to the underlying textarea being shadowed */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** When false, the backdrop renders nothing (saves work when inactive) */
  active?: boolean;
  /** Backdrop content — typically an array of text spans */
  children: React.ReactNode;
  /**
   * Textarea size variant — drives the matching Tailwind `text-sm` / `text-base`
   * class (and therefore line-height) applied on the backdrop's inner content
   * div.  Must match the variant used by the underlying textarea, otherwise
   * line wraps diverge and highlights drift by scroll position.
   */
  variant?: 'default' | 'compact';
  className?: string;
}

/** Style properties we copy from the textarea to the backdrop so line wrapping matches. */
const FONT_METRIC_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const;

export function TextareaBackdrop({
  textareaRef,
  active = true,
  children,
  variant = 'default',
  className,
}: TextareaBackdropProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Scroll sync — direct DOM mutation, no React state ──
  useLayoutEffect(() => {
    if (!active) return;
    const textarea = textareaRef.current;
    const content = contentRef.current;
    if (!textarea || !content) return;

    const sync = () => {
      // translate3d hints the browser to use the GPU compositor for the
      // transform, keeping it in sync with native textarea scroll.
      content.style.transform = `translate3d(0, ${-textarea.scrollTop}px, 0)`;
    };

    sync();
    textarea.addEventListener('scroll', sync, { passive: true });
    return () => textarea.removeEventListener('scroll', sync);
  }, [textareaRef, active]);

  // ── Font metric + scrollbar width sync ──
  useLayoutEffect(() => {
    if (!active) return;
    const textarea = textareaRef.current;
    const content = contentRef.current;
    if (!textarea || !content) return;

    const apply = () => {
      const cs = window.getComputedStyle(textarea);
      for (const prop of FONT_METRIC_PROPS) {
        const value = cs[prop];
        if (value) content.style[prop] = value;
      }
      // Scrollbar eats content width inside the textarea — mirror that on
      // the backdrop so both layers wrap at the same column.
      const scrollbarWidth = textarea.offsetWidth - textarea.clientWidth;
      content.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : '';
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(textarea);
    return () => ro.disconnect();
  }, [textareaRef, active]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className={clsx(
        'absolute inset-0 rounded border border-transparent p-2 overflow-hidden pointer-events-none',
        className,
      )}
    >
      <div
        ref={contentRef}
        className={clsx(
          'whitespace-pre-wrap break-words',
          variant === 'compact' ? 'text-sm' : 'text-base',
        )}
        style={{ willChange: 'transform' }}
      >
        {children}
      </div>
    </div>
  );
}
