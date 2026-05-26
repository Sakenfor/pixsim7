import { useState, type ReactNode } from 'react';

import { Icon, type IconName } from '@lib/icons';

interface SidebarTreeGroupProps {
  label: ReactNode;
  dotClassName?: string;
  /** When set, renders this icon as the leading marker instead of the dot. */
  icon?: IconName;
  iconClassName?: string;
  selected?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  defaultExpanded?: boolean;
  /**
   * Controlled expansion. When provided, the group ignores its internal state
   * and reflects this value (the chevron + `onClick` still fire so the parent
   * can drive accordion behaviour). Omit for the default self-managed toggle.
   */
  expanded?: boolean;
  labelClassName?: string;
  children?: ReactNode;
}

interface SidebarTreeLeafButtonProps {
  label: ReactNode;
  dotClassName?: string;
  /** When set, renders this icon as the leading marker instead of the dot. */
  icon?: IconName;
  iconClassName?: string;
  selected?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  compact?: boolean;
  labelClassName?: string;
}

export function SidebarTreeGroup({
  label,
  dotClassName = 'bg-gray-400',
  icon,
  iconClassName = 'text-neutral-400',
  selected = false,
  onClick,
  trailing,
  defaultExpanded = true,
  expanded: controlledExpanded,
  labelClassName = '',
  children,
}: SidebarTreeGroupProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  return (
    <div className="mb-0.5">
      <button
        onClick={() => {
          if (!isControlled) setInternalExpanded((prev) => !prev);
          onClick?.();
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
          selected
            ? 'bg-neutral-700/80 text-neutral-100'
            : 'hover:bg-neutral-800/60 text-neutral-300'
        }`}
      >
        <Icon
          name={expanded ? 'chevronDown' : 'chevronRight'}
          size={10}
          className="text-neutral-500 shrink-0"
        />
        {icon ? (
          <Icon name={icon} size={12} className={`shrink-0 ${iconClassName}`} />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClassName}`} />
        )}
        <span
          className={`text-[11px] font-semibold uppercase tracking-wider truncate ${labelClassName}`}
        >
          {label}
        </span>
        {trailing}
      </button>

      {expanded && <div className="ml-3 mt-px">{children}</div>}
    </div>
  );
}

export function SidebarTreeLeafButton({
  label,
  dotClassName = 'bg-gray-400',
  icon,
  iconClassName = 'text-neutral-500',
  selected = false,
  onClick,
  trailing,
  compact = false,
  labelClassName = '',
}: SidebarTreeLeafButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-2 ${
        compact ? 'py-0.5' : 'py-1'
      } rounded text-left transition-colors ${
        selected
          ? 'bg-neutral-700/80 text-neutral-100'
          : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
      }`}
    >
      {icon ? (
        <Icon name={icon} size={12} className={`shrink-0 ${iconClassName}`} />
      ) : (
        <span className={`w-1 h-1 rounded-full shrink-0 ${dotClassName}`} />
      )}
      <span className={`text-[11px] truncate flex-1 ${labelClassName}`}>{label}</span>
      {trailing}
    </button>
  );
}
