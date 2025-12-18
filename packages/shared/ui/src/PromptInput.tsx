import React, { useCallback, useRef, useEffect } from 'react';
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
}) => {
  const remaining = maxChars - value.length;
  const isOverLimit = remaining < 0;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number | null>(null);
  const isUserTypingRef = useRef(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;

    // Store cursor position before state update
    cursorPosRef.current = e.target.selectionStart;
    isUserTypingRef.current = true;

    if (enforceLimit && next.length > maxChars) {
      // Hard truncate if enforceLimit is true
      onChange(next.slice(0, maxChars));
    } else {
      // Allow exceeding limit, visual warning will be shown
      onChange(next);
    }
  }, [onChange, maxChars, enforceLimit]);

  // Restore cursor position after value updates
  useEffect(() => {
    if (isUserTypingRef.current && cursorPosRef.current !== null && textareaRef.current) {
      const textarea = textareaRef.current;
      const pos = cursorPosRef.current;

      // Restore cursor position, clamping to current value length
      const safePos = Math.min(pos, value.length);
      textarea.setSelectionRange(safePos, safePos);

      isUserTypingRef.current = false;
      cursorPosRef.current = null;
    }
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
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{ minHeight: `${effectiveMinHeight}px` }}
        className={clsx(
          'w-full rounded border p-2 bg-white dark:bg-neutral-900 outline-none flex-1',
          disabled && 'opacity-60 cursor-not-allowed',
          variant === 'compact' ? 'text-sm' : 'text-base',
          resizable ? 'resize-y' : 'resize-none',
          // Show warning border and ring when over limit
          isOverLimit
            ? 'border-red-500 dark:border-red-500 focus:ring-2 focus:ring-red-500/40'
            : 'border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-blue-500/40'
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
