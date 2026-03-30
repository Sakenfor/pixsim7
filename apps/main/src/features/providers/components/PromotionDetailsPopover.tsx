import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

import {
  buildPromotionDetailEntries,
  isPromotionActive,
  type PromotionCategory,
} from '../lib/promotionCatalog';

interface PromotionDetailsPopoverProps {
  promotions?: Record<string, unknown> | null;
  knownModelIds?: Iterable<string>;
  title?: string;
  triggerClassName?: string;
  triggerTitle?: string;
  children?: ReactNode;
}

function categoryLabel(category: PromotionCategory): string {
  if (category === 'pricing_mapped') return 'pricing mapped';
  if (category === 'pricing_unmapped') return 'pricing unmapped';
  if (category === 'feature') return 'feature flag';
  return 'inactive';
}

function categoryClasses(category: PromotionCategory): string {
  if (category === 'pricing_mapped') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  }
  if (category === 'pricing_unmapped') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  }
  if (category === 'feature') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  }
  return 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
}

function discountLabel(multiplier?: number): string | null {
  if (multiplier === undefined) return null;
  const percentOff = Math.round((1 - multiplier) * 100);
  if (percentOff <= 0) return null;
  return `${percentOff}% off`;
}

export function PromotionDetailsPopover({
  promotions,
  knownModelIds,
  title = 'Promotions',
  triggerClassName,
  triggerTitle = 'Promotion details',
  children,
}: PromotionDetailsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const entries = useMemo(
    () => buildPromotionDetailEntries(promotions, knownModelIds),
    [promotions, knownModelIds],
  );
  const activeCount = useMemo(
    () => Object.values(promotions ?? {}).filter((value) => isPromotionActive(value)).length,
    [promotions],
  );

  if (!promotions || Object.keys(promotions).length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={clsx(
          'inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800/70 dark:bg-amber-900/30 dark:text-amber-200',
          triggerClassName,
        )}
        title={triggerTitle}
      >
        {children ?? (
          <>
            <Icon name="sparkles" size={10} />
            promo {activeCount > 0 ? activeCount : ''}
          </>
        )}
      </button>

      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="end"
        offset={6}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      >
        <div className="w-[320px] max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              {activeCount} active / {entries.length} total
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">No promotions found.</div>
          ) : (
            <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <div key={entry.rawKey} className="rounded border border-neutral-200 px-2 py-1.5 dark:border-neutral-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-200">
                      {entry.key}
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.02em]',
                        entry.active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
                      )}
                    >
                      {entry.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                    <span className={clsx('rounded px-1 py-0.5 font-medium', categoryClasses(entry.category))}>
                      {categoryLabel(entry.category)}
                    </span>
                    {discountLabel(entry.discountMultiplier) && (
                      <span className="rounded bg-emerald-100 px-1 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {discountLabel(entry.discountMultiplier)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
