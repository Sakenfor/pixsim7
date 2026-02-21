import { IconButton } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useState, useRef } from 'react';

import { Icon, IconBadge, type IconName } from '@lib/icons';

import { OPERATION_ICONS, DROPDOWN_MENU_CLS, DROPDOWN_ITEM_CLS, useClickOutside } from './constants';

/** Compact operation type icon button with dropdown picker. */
export function OperationIconButton({
  operationType,
  onSelect,
  disabled,
}: {
  operationType: string;
  onSelect: (op: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const current = OPERATION_ICONS[operationType] ?? { icon: 'alertCircle' as IconName, label: operationType, color: '#6B7280' };

  return (
    <div ref={ref} className="relative">
      <IconButton
        bg={current.color}
        size="lg"
        icon={<Icon name={current.icon} size={14} />}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={current.label}
      />

      {open && (
        <div className={DROPDOWN_MENU_CLS}>
          {Object.entries(OPERATION_ICONS).map(([op, meta]) => (
            <button
              key={op}
              type="button"
              onClick={() => { onSelect(op); setOpen(false); }}
              className={clsx(DROPDOWN_ITEM_CLS, operationType === op && 'font-semibold')}
            >
              <IconBadge name={meta.icon} size={10} bg={meta.color} rounded="md" className="w-4 h-4 shrink-0" />
              {meta.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
