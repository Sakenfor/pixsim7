import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface SidebarPaneShellProps {
  title?: ReactNode;
  children: ReactNode;
  variant?: 'light' | 'dark';
  widthClassName?: string;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /** When false, body uses overflow-hidden and no padding (for children that manage their own scrolling). Default: true. */
  bodyScrollable?: boolean;
}

export function SidebarPaneShell({
  title,
  children,
  variant = 'light',
  widthClassName = 'w-48',
  className,
  headerClassName,
  bodyClassName,
  bodyScrollable = true,
}: SidebarPaneShellProps) {
  const borderClass =
    variant === 'light' ? 'border-neutral-200 dark:border-neutral-800' : 'border-neutral-800';
  const titleClass =
    variant === 'light'
      ? 'text-sm font-semibold text-neutral-800 dark:text-neutral-100'
      : 'text-sm font-semibold text-neutral-200';

  return (
    <div className={clsx(widthClassName, 'flex shrink-0 flex-col border-r', borderClass, className)}>
      {title ? (
        <div className={clsx('shrink-0 border-b px-3 py-3', borderClass, headerClassName)}>
          <h1 className={titleClass}>{title}</h1>
        </div>
      ) : null}
      <div className={clsx('min-h-0 flex-1', bodyScrollable ? 'overflow-y-auto p-2' : 'overflow-hidden', bodyClassName)}>{children}</div>
    </div>
  );
}
