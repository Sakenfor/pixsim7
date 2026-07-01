import { Dropdown, DropdownItem } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon, type IconName } from '@lib/icons';

export type GallerySortKey = 'new' | 'old' | 'size';

interface SortOption {
  value: GallerySortKey;
  label: string;
  icon: IconName;
}

const SORT_OPTIONS: SortOption[] = [
  { value: 'new', label: 'Newest First', icon: 'arrowDown' },
  { value: 'old', label: 'Oldest First', icon: 'arrowUp' },
  { value: 'size', label: 'Largest First', icon: 'maximize2' },
];

interface GallerySortMenuProps {
  value: GallerySortKey;
  onChange: (value: GallerySortKey) => void;
}

/**
 * GallerySortMenu — compact sort control for the gallery chrome row.
 *
 * Replaces the wide native `<select>` ("Newest First" …) with an icon trigger
 * that reflects the active sort. The text label collapses on small screens
 * (`hidden sm:inline`) so on mobile it's icon-only, freeing horizontal space so
 * the toolbar packs onto fewer rows.
 */
export function GallerySortMenu({ value, onChange }: GallerySortMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 text-xs inline-flex items-center gap-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title={`Sort: ${active.label}`}
        aria-label={`Sort: ${active.label}`}
      >
        <Icon name={active.icon} size={13} />
        <span className="hidden sm:inline">{active.label}</span>
        <Icon
          name="chevronDown"
          size={10}
          className={`hidden sm:inline transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom-right"
        minWidth="160px"
        triggerRef={triggerRef}
      >
        {SORT_OPTIONS.map((opt) => (
          <DropdownItem
            key={opt.value}
            icon={<Icon name={opt.icon} size={13} />}
            variant={opt.value === value ? 'primary' : 'default'}
            rightSlot={opt.value === value ? <Icon name="check" size={12} /> : undefined}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
          >
            {opt.label}
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}
