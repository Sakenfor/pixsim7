import { IconButton } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useState, useRef } from 'react';

import { Icon, IconBadge, type IconName } from '@lib/icons';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import { DROPDOWN_MENU_CLS, DROPDOWN_ITEM_CLS, useClickOutside } from './constants';

/** Operations shown in the icon button picker (only those with icon + color). */
function usePickerOperations() {
  return useMemo(
    () => OPERATION_TYPES
      .filter((op) => OPERATION_METADATA[op].icon && OPERATION_METADATA[op].color)
      .map((op) => ({ op, ...OPERATION_METADATA[op] })),
    [],
  );
}

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

  const meta = OPERATION_METADATA[operationType as OperationType];
  const icon = (meta?.icon ?? 'alertCircle') as IconName;
  const color = meta?.color ?? '#6B7280';
  const label = meta?.label ?? operationType;

  const pickerOps = usePickerOperations();

  return (
    <div ref={ref} className="relative">
      <IconButton
        bg={color}
        size="lg"
        icon={<Icon name={icon} size={14} />}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={label}
      />

      {open && (
        <div className={DROPDOWN_MENU_CLS}>
          {pickerOps.map(({ op, icon: opIcon, color: opColor, label: opLabel }) => (
            <button
              key={op}
              type="button"
              onClick={() => { onSelect(op); setOpen(false); }}
              className={clsx(DROPDOWN_ITEM_CLS, operationType === op && 'font-semibold')}
            >
              <IconBadge name={opIcon as IconName} size={10} bg={opColor} rounded="md" className="w-4 h-4 shrink-0" />
              {opLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
