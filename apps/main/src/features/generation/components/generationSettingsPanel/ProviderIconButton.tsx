import { IconButton, Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';

import { PROVIDER_BRANDS, DROPDOWN_ITEM_CLS } from './constants';

/** Compact provider badge with dropdown picker. */
export function ProviderIconButton({
  providerId,
  providers,
  onSelect,
  disabled,
}: {
  providerId: string;
  providers: { id: string; name: string }[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const brand = PROVIDER_BRANDS[providerId] ?? { color: '#6B7280', short: providerId.slice(0, 2) };

  return (
    <>
      <IconButton
        ref={triggerRef}
        bg={brand.color}
        size="lg"
        icon={<span className="text-[10px] font-bold">{brand.short}</span>}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={providerId}
      />

      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      >
        <div className="min-w-[140px] py-1 rounded-lg shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
          {providers.map(p => {
            const b = PROVIDER_BRANDS[p.id] ?? { color: '#6B7280', short: p.id.slice(0, 2) };
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p.id); setOpen(false); }}
                className={clsx(DROPDOWN_ITEM_CLS, providerId === p.id && 'font-semibold')}
              >
                <span
                  className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0"
                  style={{ backgroundColor: b.color }}
                >{b.short}</span>
                {p.name}
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
