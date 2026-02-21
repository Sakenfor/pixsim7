import { IconButton } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';

import { PROVIDER_BRANDS, AUTO_BRAND, DROPDOWN_MENU_CLS, DROPDOWN_ITEM_CLS, useClickOutside } from './constants';

/** Compact provider badge with dropdown picker. */
export function ProviderIconButton({
  providerId,
  providers,
  onSelect,
  disabled,
}: {
  providerId: string | undefined;
  providers: { id: string; name: string }[];
  onSelect: (id: string | undefined) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const brand = providerId ? (PROVIDER_BRANDS[providerId] ?? { color: '#6B7280', short: providerId.slice(0, 2) }) : AUTO_BRAND;

  return (
    <div ref={ref} className="relative">
      <IconButton
        bg={brand.color}
        size="lg"
        icon={<span className="text-[10px] font-bold">{brand.short}</span>}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={providerId ?? 'Auto'}
      />

      {open && (
        <div className={DROPDOWN_MENU_CLS}>
          <button
            type="button"
            onClick={() => { onSelect(undefined); setOpen(false); }}
            className={clsx(DROPDOWN_ITEM_CLS, !providerId && 'font-semibold')}
          >
            <span
              className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0"
              style={{ backgroundColor: AUTO_BRAND.color }}
            >{AUTO_BRAND.short}</span>
            Auto
          </button>

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
      )}
    </div>
  );
}
