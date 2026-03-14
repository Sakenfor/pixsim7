/**
 * SearchInput - Search box with consistent styling and optional debounce
 *
 * Wraps the base Input with search-specific defaults: placeholder icon area,
 * clear button, and optional debounced onChange.
 *
 * @example Basic usage
 * ```tsx
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search plugins..."
 * />
 * ```
 *
 * @example With debounce
 * ```tsx
 * <SearchInput
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Search..."
 *   debounceMs={300}
 * />
 * ```
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export interface SearchInputProps {
  /** Current search value */
  value: string;
  /** Called when value changes (after debounce if configured) */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in ms. 0 = no debounce (default). */
  debounceMs?: number;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-1.5',
  md: 'text-sm px-3 py-2',
} as const;

/**
 * Search input with consistent styling across the app.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Search...',
      debounceMs = 0,
      size = 'sm',
      disabled = false,
      className,
      autoFocus,
    },
    ref,
  ) => {
    const [localValue, setLocalValue] = useState(value);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDebounced = debounceMs > 0;

    // Sync external value changes
    useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setLocalValue(next);

        if (!isDebounced) {
          onChange(next);
          return;
        }

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          onChange(next);
        }, debounceMs);
      },
      [onChange, isDebounced, debounceMs],
    );

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    return (
      <input
        ref={ref}
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={clsx(
          'w-full rounded border outline-none transition-colors',
          'bg-white dark:bg-neutral-800',
          'border-neutral-300 dark:border-neutral-700',
          'text-neutral-900 dark:text-neutral-100',
          'placeholder-neutral-500 dark:placeholder-neutral-400',
          'focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          SIZE_CLASSES[size],
          disabled && 'opacity-60 cursor-not-allowed',
          className,
        )}
      />
    );
  },
);

SearchInput.displayName = 'SearchInput';
