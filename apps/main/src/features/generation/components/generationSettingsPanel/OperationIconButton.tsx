import { IconButton, Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo, useState, useRef } from 'react';

import { Icon, IconBadge, type IconName } from '@lib/icons';

import { providerCapabilityRegistry } from '@features/providers';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import { DROPDOWN_ITEM_CLS } from './constants';

/** Operations shown in the icon button picker, filtered by provider when set. */
function usePickerOperations(providerId?: string) {
  return useMemo(
    () => OPERATION_TYPES
      .filter((op) => OPERATION_METADATA[op].icon && OPERATION_METADATA[op].color)
      .filter((op) => !providerId || providerCapabilityRegistry.supportsOperation(providerId, op))
      .map((op) => ({ op, ...OPERATION_METADATA[op] })),
    [providerId],
  );
}

/** Compact operation type icon button with dropdown picker. */
export function OperationIconButton({
  operationType,
  onSelect,
  disabled,
  providerId,
  textMode,
}: {
  operationType: string;
  onSelect: (op: string) => void;
  disabled?: boolean;
  providerId?: string;
  /** When true, renders as outline/ghost to indicate text-only generation. */
  textMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const meta = OPERATION_METADATA[operationType as OperationType];
  const icon = (meta?.icon ?? 'alertCircle') as IconName;
  const color = meta?.color ?? '#6B7280';
  const label = meta?.label ?? operationType;

  const pickerOps = usePickerOperations(providerId);

  return (
    <>
      <IconButton
        ref={triggerRef}
        bg={textMode ? undefined : color}
        size="lg"
        icon={<Icon name={icon} size={14} />}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title={textMode ? `${label} (text-only — no asset input)` : label}
        style={textMode ? { color, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
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
      </Popover>
    </>
  );
}
