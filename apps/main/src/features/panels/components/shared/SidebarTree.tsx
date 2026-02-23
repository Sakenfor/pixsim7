import { useState, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

interface SidebarTreeGroupProps {
  label: ReactNode;
  dotClassName?: string;
  selected?: boolean;
  onClick?: () => void;
  trailing?: ReactNode;
  defaultExpanded?: boolean;
  labelClassName?: string;
  children?: ReactNode;
}

interface SidebarTreeLeafButtonProps {
  label: ReactNode;
  dotClassName?: string;
  selected?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  compact?: boolean;
  labelClassName?: string;
}

export function SidebarTreeGroup({
  label,
  dotClassName = 'bg-gray-400',
  selected = false,
  onClick,
  trailing,
  defaultExpanded = true,
  labelClassName = '',
  children,
}: SidebarTreeGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-0.5">
      <button
        onClick={() => {
          setExpanded((prev) => !prev);
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
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClassName}`} />
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
      <span className={`w-1 h-1 rounded-full shrink-0 ${dotClassName}`} />
      <span className={`text-[11px] truncate flex-1 ${labelClassName}`}>{label}</span>
      {trailing}
    </button>
  );
}
