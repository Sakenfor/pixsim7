import { Badge, Dropdown, DropdownItem } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon } from '@lib/icons';

export function ClickableBadge({
  value,
  displayValue,
  color,
  options,
  onSelect,
  disabled,
}: {
  value: string;
  displayValue?: string;
  color: 'green' | 'blue' | 'gray' | 'orange' | 'red';
  options: { value: string; label: string; color: 'green' | 'blue' | 'gray' | 'orange' | 'red' }[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="cursor-pointer hover:opacity-80 transition-opacity"
        disabled={disabled}
      >
        <Badge color={color}>
          {displayValue ?? value}
          <Icon name="chevronDown" size={8} className="ml-0.5 inline-block opacity-50" />
        </Badge>
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        minWidth="100px"
      >
        {options.map((opt) => (
          <DropdownItem
            key={opt.value}
            onClick={() => {
              onSelect(opt.value);
              setOpen(false);
            }}
            icon={<Badge color={opt.color} className="text-[9px] !px-1">{opt.value === value ? '\u2713' : '\u00A0'}</Badge>}
          >
            {opt.label}
          </DropdownItem>
        ))}
      </Dropdown>
    </span>
  );
}
