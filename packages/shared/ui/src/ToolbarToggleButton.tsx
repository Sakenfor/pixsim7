import type { ReactNode } from 'react';

export interface ToolbarToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  className?: string;
}

export function ToolbarToggleButton({
  active,
  onClick,
  icon,
  title,
  className = '',
}: ToolbarToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-500'
      } ${className}`}
      title={title}
    >
      {icon}
    </button>
  );
}
