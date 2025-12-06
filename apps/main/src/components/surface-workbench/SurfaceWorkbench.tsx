import clsx from 'clsx';
import { Panel } from '@pixsim7/shared.ui';
import React from 'react';

type StatusType = 'info' | 'success' | 'warning' | 'error';

export interface SurfaceWorkbenchStatus {
  type: StatusType;
  content: React.ReactNode;
}

export interface SurfaceWorkbenchProps {
  /** Main title shown in the header */
  title: React.ReactNode;
  /** Optional subtitle/description */
  description?: React.ReactNode;
  /** Optional header actions (buttons, toggles, etc.) */
  headerActions?: React.ReactNode;
  /** Optional sidebar content rendered on the left */
  sidebar?: React.ReactNode;
  /** Preview area rendered in the middle column (when mainContent is not provided) */
  preview?: React.ReactNode;
  /** Inspector content rendered on the right column (when mainContent is not provided) */
  inspector?: React.ReactNode;
  /** Override inspector width class (defaults to w-80) */
  inspectorWidthClassName?: string;
  /** Optional footer (i.e., Save / Cancel buttons) */
  footer?: React.ReactNode;
  /** Status or banner messages shown beneath the header */
  statusMessages?: SurfaceWorkbenchStatus[];
  /** Provide custom main content instead of the default preview+inspector layout */
  mainContent?: React.ReactNode;
  /** Optional custom className applied to the root panel */
  className?: string;
  /** Hide the built-in header chrome when embedding inside another shell */
  showHeader?: boolean;
}

const STATUS_STYLES: Record<StatusType, string> = {
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  success:
    'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200',
  warning:
    'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200',
};

/**
 * SurfaceWorkbench
 *
 * Generic layout shell for visual editors (overlay, HUD, dashboards, etc.).
 * Provides consistent header chrome, optional sidebar, preview, inspector, and footers.
 */
export function SurfaceWorkbench({
  title,
  description,
  headerActions,
  sidebar,
  preview,
  inspector,
  inspectorWidthClassName = 'w-80',
  footer,
  statusMessages,
  mainContent,
  className,
  showHeader = true,
}: SurfaceWorkbenchProps) {
  return (
    <Panel className={clsx('space-y-4 h-full', className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-200">{title}</h2>
            {description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">{description}</p>
            )}
          </div>
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}

      {/* Status messages */}
      {statusMessages?.map((message, idx) => (
        <div
          key={idx}
          className={clsx(
            'p-3 border rounded text-sm',
            STATUS_STYLES[message.type] ?? STATUS_STYLES.info
          )}
        >
          {message.content}
        </div>
      ))}

      {/* Main layout */}
      <div className="flex gap-4 h-full">
        {sidebar && <div className="w-64 flex-shrink-0 space-y-4">{sidebar}</div>}

        <div className="flex-1 flex flex-col gap-4">
          {mainContent ?? (
            <div className="flex gap-4 h-full">
              {preview && (
                <div className="flex-1 flex flex-col">
                  {preview}
                </div>
              )}
              {inspector && (
                <div className={clsx('flex-shrink-0', inspectorWidthClassName)}>
                  {inspector}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
          {footer}
        </div>
      )}
    </Panel>
  );
}
