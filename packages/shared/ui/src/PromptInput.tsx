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

  return (
    <div className={clsx('flex flex-col', className)}>
      <textarea
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={clsx(
          'w-full resize-none rounded border p-2 bg-white dark:bg-neutral-900 outline-none focus:ring-2 focus:ring-blue-500/40',
          disabled && 'opacity-60 cursor-not-allowed',
          variant === 'compact' ? 'text-sm min-h-[70px]' : 'text-base min-h-[110px]'
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
