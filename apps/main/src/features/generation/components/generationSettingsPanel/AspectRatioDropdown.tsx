import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';


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

  const label = getAspectRatioLabel(currentValue);

  return (
    <>
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

      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      >
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[200px] overflow-y-auto min-w-[160px]">
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
      </Popover>
    </>
  );
}
