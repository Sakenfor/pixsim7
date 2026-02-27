import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface GraphSidebarSectionProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function GraphSidebarSection({
  title,
  children,
  className,
  titleClassName,
}: GraphSidebarSectionProps) {
  return (
    <section className={clsx('mb-3', className)}>
      <div
        className={clsx(
          'mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500',
          titleClassName,
        )}
      >
        {title}
      </div>
      {children}
    </section>
  );
}
