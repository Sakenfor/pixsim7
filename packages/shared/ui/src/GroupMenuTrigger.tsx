import { forwardRef, type ReactNode } from 'react';

export interface GroupMenuTriggerProps {
  icon: ReactNode;
  active: boolean;
  count?: number;
  onClick: () => void;
  title: string;
  className?: string;
}

export const GroupMenuTrigger = forwardRef<HTMLButtonElement, GroupMenuTriggerProps>(
  function GroupMenuTrigger({ icon, active, count, onClick, title, className = '' }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={`relative inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
          active
            ? 'bg-accent/10 border-accent/50 text-accent'
            : 'bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        } ${className}`}
      >
        {icon}
        {count != null && count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
            {count}
          </span>
        )}
      </button>
    );
  }
);
