import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';

import { ModelBadge, type ModelFamilyInfo } from '@lib/generation-ui';
import { Icon } from '@lib/icons';

function getModelMatchKeys(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  const lastSegment = lower.split(/[/:]/).filter(Boolean).at(-1) ?? lower;
  const compactLastSegment = lastSegment.replace(/[\s_-]+/g, '');
  return [trimmed, lower, compact, lastSegment, compactLastSegment];
}

function isModelInSet(models: Set<string>, value: unknown): boolean {
  return getModelMatchKeys(value).some((key) => models.has(key));
}

export function ModelDropdown({
  options,
  currentValue,
  onChange,
  disabled,
  modelFamilies,
  unlimitedModels,
  promotedModels = new Set<string>(),
}: {
  options: string[];
  currentValue: string;
  onChange: (value: string) => void;
  disabled: boolean;
  modelFamilies: Record<string, ModelFamilyInfo> | null;
  unlimitedModels: Set<string>;
  promotedModels?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentFamily = modelFamilies?.[currentValue];
  const isFree = isModelInSet(unlimitedModels, currentValue);
  const isPromo = isModelInSet(promotedModels, currentValue);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onWheel={(e) => {
          if (disabled || options.length <= 1) return;
          e.preventDefault();
          const idx = options.indexOf(currentValue);
          const next = e.deltaY > 0
            ? (idx + 1) % options.length
            : (idx - 1 + options.length) % options.length;
          onChange(options[next]);
        }}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-1.5 w-fit max-w-full px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
          'bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700',
          disabled && 'opacity-50 cursor-not-allowed',
          isFree
            ? 'text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
            : 'text-neutral-700 dark:text-neutral-200',
        )}
      >
        {currentFamily && <ModelBadge family={currentFamily} size={14} />}
        <span className="min-w-0 text-left truncate">{currentValue}</span>
        {isFree && (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Free
          </span>
        )}
        {isPromo && !isFree && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Sale
          </span>
        )}
        <Icon name="chevronDown" size={12} className={clsx('text-neutral-400 transition-transform shrink-0', open && 'rotate-180')} />
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
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[200px] overflow-y-auto min-w-[180px]">
          {options.map((opt) => {
            const family = modelFamilies?.[opt];
            const isSelected = currentValue === opt;
            const optFree = isModelInSet(unlimitedModels, opt);
            const optPromo = isModelInSet(promotedModels, opt);
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
                {family ? <ModelBadge family={family} size={14} /> : <span className="w-3.5" />}
                <span className="truncate">{opt}</span>
                {optFree && (
                  <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-1 py-px text-[8px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    free
                  </span>
                )}
                {optPromo && !optFree && (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-1 py-px text-[8px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    sale
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
