import React, { useCallback } from 'react';
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
}) => {
  const remaining = maxChars - value.length;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next.length <= maxChars) {
      onChange(next);
    } else {
      // Hard truncate any paste beyond limit
      onChange(next.slice(0, maxChars));
    }
  }, [onChange, maxChars]);

  // Calculate min-height: use prop if provided, else variant default
  const defaultMinHeight = variant === 'compact' ? 70 : 110;
  const effectiveMinHeight = minHeight ?? defaultMinHeight;

  return (
    <div className={clsx('flex flex-col', className)}>
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        style={{ minHeight: `${effectiveMinHeight}px` }}
        className={clsx(
          'w-full rounded border p-2 bg-white dark:bg-neutral-900 outline-none focus:ring-2 focus:ring-blue-500/40 flex-1',
          disabled && 'opacity-60 cursor-not-allowed',
          variant === 'compact' ? 'text-sm' : 'text-base',
          resizable ? 'resize-y' : 'resize-none'
        )}
      />
      {showCounter && (
        <div className="mt-1 flex justify-end text-xs tabular-nums text-neutral-500">
          <span className={clsx(remaining < 0 && 'text-red-600')}>{remaining} chars left</span>
        </div>
      )}
    </div>
  );
};
