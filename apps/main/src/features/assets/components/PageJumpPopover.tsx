import { Dropdown, Input } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// PageJumpPopover — replaces browser prompt() for "go to page" input
// ---------------------------------------------------------------------------

export interface PageJumpPopoverProps {
  currentPage: number;
  totalPages: number;
  hasMore?: boolean;
  loading: boolean;
  onGoToPage: (page: number) => void;
}

export function PageJumpPopover({
  currentPage,
  totalPages,
  hasMore,
  loading,
  onGoToPage,
}: PageJumpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Sync anchor rect while open
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setAnchorRect(null);
      return;
    }
    const update = () => {
      setAnchorRect(anchorRef.current?.getBoundingClientRect() ?? null);
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

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
      onGoToPage(page);
    }
    setOpen(false);
  }, [value, onGoToPage]);

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
        className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors min-w-[60px] text-center"
        title="Click to jump to page"
      >
        {pageLabel}
      </button>
      {open && anchorRect && (
        <Dropdown
          isOpen={open}
          onClose={() => setOpen(false)}
          positionMode="fixed"
          anchorPosition={{
            x: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 200 - 8)),
            y: anchorRect.bottom + 4,
          }}
          minWidth="180px"
          className="max-w-[220px]"
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
                className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
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
        </Dropdown>
      )}
    </>
  );
}
