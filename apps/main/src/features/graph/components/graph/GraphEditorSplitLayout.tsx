import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface GraphEditorSplitLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  sidebarWidthPx?: number;
  className?: string;
  sidebarClassName?: string;
  mainClassName?: string;
}

export function GraphEditorSplitLayout({
  sidebar,
  main,
  sidebarWidthPx = 320,
  className,
  sidebarClassName,
  mainClassName,
}: GraphEditorSplitLayoutProps) {
  return (
    <div
      className={clsx('grid min-h-0 flex-1', className)}
      style={{ gridTemplateColumns: `${sidebarWidthPx}px minmax(0, 1fr)` }}
    >
      <div
        className={clsx(
          'min-h-0 overflow-y-auto border-r border-neutral-200 p-2 dark:border-neutral-700',
          sidebarClassName,
        )}
      >
        {sidebar}
      </div>
      <div className={clsx('min-h-0 overflow-y-auto p-3', mainClassName)}>
        {main}
      </div>
    </div>
  );
}
