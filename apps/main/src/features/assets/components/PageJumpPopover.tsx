import { Input, Popover } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// PageJumpPopover — replaces browser prompt() for "go to page" input
// ---------------------------------------------------------------------------

export interface PageJumpPopoverProps {
  currentPage: number;
  totalPages: number;
  hasMore?: boolean;
  loading: boolean;
  onGoToPage: (page: number) => void;
  /** When true, renders without its own border (for use inside a shared chip container) */
  borderless?: boolean;
}

export function PageJumpPopover({
  currentPage,
  totalPages,
  hasMore,
  loading,
  onGoToPage,
  borderless,
}: PageJumpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Auto-focus + select when opened
  useEffect(() => {
    if (open) {
      setValue(String(currentPage));
      // Wait a tick so the Dropdown has mounted the input
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, currentPage]);

  const submit = useCallback(() => {
    const page = parseInt(value, 10);
    if (!isNaN(page) && page >= 1) {
      // When we know the exact total (hasMore=false), clamp client-side
      const clamped = !hasMore && totalPages >= 1 ? Math.min(page, totalPages) : page;
      onGoToPage(clamped);
    }
    setOpen(false);
  }, [value, onGoToPage, hasMore, totalPages]);

  const appendDigit = useCallback((digit: string) => {
    setValue((prev) => prev + digit);
    inputRef.current?.focus();
  }, []);

  const backspace = useCallback(() => {
    setValue((prev) => prev.slice(0, -1));
    inputRef.current?.focus();
  }, []);

  const pageLabel = loading
    ? '...'
    : `${currentPage}/${hasMore ? `${totalPages}+` : totalPages}`;

  const PAD_ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '↵'],
  ] as const;

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen((prev) => !prev)}
        className={`h-7 px-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors min-w-[36px] text-center ${
          borderless ? '' : 'border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900/60'
        }`}
        title="Click to jump to page"
      >
        {pageLabel}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchorRef.current}
        placement="bottom"
        align="start"
        offset={4}
        triggerRef={anchorRef}
        className="w-[200px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
      >
          <div
            className="p-2 space-y-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          >
            {/* Input row */}
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                size="sm"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={value}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setValue(raw);
                }}
                placeholder={`1–${totalPages}${hasMore ? '+' : ''}`}
                className="flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={submit}
                className="px-2 py-1 text-xs font-medium rounded bg-accent text-accent-text hover:bg-accent/80 transition-colors"
              >
                Go
              </button>
            </div>
            {/* Number pad */}
            <div className="grid grid-cols-3 gap-1">
              {PAD_ROWS.flat().map((key) => (
                <button
                  key={key}
                  type="button"
                  className="py-1.5 text-sm rounded border border-neutral-200 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors"
                  onClick={() => {
                    if (key === '⌫') backspace();
                    else if (key === '↵') submit();
                    else appendDigit(key);
                  }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
      </Popover>
    </>
  );
}
