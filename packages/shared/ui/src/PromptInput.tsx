import React, { useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import clsx from 'clsx';

const DEFAULT_PROMPT_MAX_CHARS = 800;

/**
 * PromptInput — canonical text prompt component.
 * REUSE this component for any prompt collection across the app.
 * If you need a variant, extend via props instead of copying.
 */
export interface PromptInputProps {
  value: string;
  onChange: (val: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  /** Allow vertical resize. Defaults to false for backwards compat */
  resizable?: boolean;
  /** Minimum height in pixels */
  minHeight?: number;
  /** If true, hard-truncate input at maxChars. If false, allow exceeding limit with visual warning. Defaults to false. */
  enforceLimit?: boolean;
  /** Optional external ref to the underlying textarea element */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Make textarea background transparent (for backdrop overlays like ghost diff) */
  transparent?: boolean;
  /** Pass-through onInput handler (e.g. for @mention trigger detection). */
  onInput?: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  /** Pass-through onKeyDown handler (e.g. for mention picker nav, Enter-to-submit). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  maxChars = DEFAULT_PROMPT_MAX_CHARS,
  placeholder = 'Describe what you want to generate…',
  disabled = false,
  autoFocus = false,
  className,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
  enforceLimit = false,
  textareaRef: externalTextareaRef,
  transparent = false,
  onInput,
  onKeyDown,
}) => {
  const remaining = maxChars - value.length;
  const isOverLimit = remaining < 0;

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef ?? internalRef;
  const cursorPosRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Store cursor position AND scroll position before state update
    cursorPosRef.current = cursorPos;
    scrollPosRef.current = e.target.scrollTop;
    isUserTypingRef.current = true;

    const valueToSend = enforceLimit && next.length > maxChars ? next.slice(0, maxChars) : next;

    // If we're enforcing and truncating, adjust cursor position
    if (enforceLimit && next.length > maxChars && cursorPos > maxChars) {
      cursorPosRef.current = maxChars;
    }

    onChange(valueToSend);
  }, [onChange, maxChars, enforceLimit]);

  // Restore cursor position and scroll position after value updates
  // Use useLayoutEffect to run synchronously before browser paint (prevents flash)
  useLayoutEffect(() => {
    if (!isUserTypingRef.current || cursorPosRef.current === null || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    const pos = cursorPosRef.current;
    const scrollPos = scrollPosRef.current;

    try {
      // Only restore if the textarea is still focused
      if (document.activeElement === textarea) {
        // Restore scroll position FIRST to prevent auto-scroll
        if (scrollPos !== null) {
          textarea.scrollTop = scrollPos;
        }

        // Then restore cursor position, clamping to current value length
        const safePos = Math.min(pos, textarea.value.length);
        textarea.setSelectionRange(safePos, safePos);

        // Restore scroll position AGAIN after cursor restoration
        // (setSelectionRange can trigger auto-scroll in some browsers)
        if (scrollPos !== null) {
          textarea.scrollTop = scrollPos;
        }
      }
    } catch {
      // Silently fail if setSelectionRange fails
    }

    // Reset flags after restoration
    isUserTypingRef.current = false;
    cursorPosRef.current = null;
    scrollPosRef.current = null;
  }, [value]);

  // Calculate min-height: use prop if provided, else variant default
  const defaultMinHeight = variant === 'compact' ? 70 : 110;
  const effectiveMinHeight = minHeight ?? defaultMinHeight;

  return (
    <div className={clsx('flex flex-col', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onInput={onInput}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{ minHeight: `${effectiveMinHeight}px` }}
        className={clsx(
          'w-full rounded border p-2 outline-none flex-1',
          transparent ? 'bg-transparent' : 'bg-white dark:bg-neutral-900',
          disabled && 'opacity-60 cursor-not-allowed',
          variant === 'compact' ? 'text-sm' : 'text-base',
          resizable ? 'resize-y' : 'resize-none',
          // Show warning border and ring when over limit
          isOverLimit
            ? 'border-red-500 dark:border-red-500 focus:ring-2 focus:ring-red-500/40'
            : 'border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-accent/40'
        )}
      />
      {showCounter && (
        <div className="mt-1 flex justify-between items-center text-xs">
          {isOverLimit && (
            <span className="text-red-600 dark:text-red-400 font-medium">
              ⚠️ Over limit by {Math.abs(remaining)} chars
            </span>
          )}
          <span className={clsx(
            'tabular-nums ml-auto',
            isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500'
          )}>
            {value.length} / {maxChars}
          </span>
        </div>
      )}
    </div>
  );
};
