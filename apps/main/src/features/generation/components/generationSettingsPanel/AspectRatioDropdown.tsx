import clsx from 'clsx';
import { useState, useRef, useEffect } from 'react';

import { getAspectRatioLabel, getParamIcon } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

export function AspectRatioDropdown({
  options,
  currentValue,
  onChange,
  disabled,
}: {
  options: string[];
  currentValue: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const label = getAspectRatioLabel(currentValue);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
          'bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700',
          'text-neutral-700 dark:text-neutral-200',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {getParamIcon('aspect_ratio', currentValue)}
        <span className="flex-1 text-left truncate">{label}</span>
        <Icon name="chevronDown" size={12} className={clsx('text-neutral-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute z-50 mt-1 left-0 right-0 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[200px] overflow-y-auto"
        >
          {options.map((opt) => {
            const isSelected = currentValue === opt;
            return (
              <button
                type="button"
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={clsx(
                  'flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-left transition-colors',
                  isSelected
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                )}
              >
                {getParamIcon('aspect_ratio', opt)}
                <span>{getAspectRatioLabel(opt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
