/**
 * PanelShell
 *
 * Structural skeleton for panel content inside dockview or standalone contexts.
 * Enforces the flex-column contract (header shrink-0, body flex-1 min-h-0 with
 * overflow) so consumers never forget min-h-0 or overflow-y-auto.
 *
 * Sidebar slots are purely structural — they provide shrink-0 + width + min-h-0.
 * The sidebar *content* controls its own appearance (background, borders, scroll).
 * This keeps PanelShell composable with OverlaySidePanel, SidebarPaneShell, or
 * plain JSX.
 *
 * Usage:
 *
 *   // Single sidebar (left)
 *   <PanelShell header={<Toolbar />} sidebar={<NavTree />} sidebarWidth="w-56">
 *     <MyContent />
 *   </PanelShell>
 *
 *   // Dual sidebars (overlay-style)
 *   <PanelShell
 *     sidebar={<ToolsPanel />} sidebarWidth="w-32"
 *     sidebarRight={<LayersPanel />} sidebarRightWidth="w-40"
 *     bodyScroll={false}
 *   >
 *     <Canvas />
 *   </PanelShell>
 *
 *   // No sidebar, dockview body
 *   <PanelShell header={<CompactBar />} bodyScroll={false}>
 *     <PanelHostDockview ... />
 *   </PanelShell>
 */

import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface PanelShellProps {
  children: ReactNode;

  /** Fixed-height header/toolbar rendered above the body. Gets shrink-0. */
  header?: ReactNode;

  /** Fixed-height footer rendered below the body. Gets shrink-0. */
  footer?: ReactNode;

  /**
   * Left sidebar element. Gets shrink-0 + width from `sidebarWidth`.
   * Content controls its own background, borders, and scroll behavior.
   */
  sidebar?: ReactNode;

  /** Tailwind width class for the left sidebar. Default: 'w-48'. */
  sidebarWidth?: string;

  /**
   * Right sidebar element. Gets shrink-0 + width from `sidebarRightWidth`.
   * Content controls its own background, borders, and scroll behavior.
   */
  sidebarRight?: ReactNode;

  /** Tailwind width class for the right sidebar. Default: 'w-48'. */
  sidebarRightWidth?: string;

  /**
   * Whether the body area scrolls vertically. Default: true.
   * Set to false when the body manages its own scroll (e.g. a nested dockview
   * or canvas).
   */
  bodyScroll?: boolean;

  /** Extra class names on the body wrapper. */
  bodyClassName?: string;

  /** Extra class names on the root container. */
  className?: string;
}

function SidebarSlot({ children, width }: { children: ReactNode; width: string }) {
  return (
    <div className={clsx(width, 'shrink-0 min-h-0')}>
      {children}
    </div>
  );
}

export function PanelShell({
  children,
  header,
  footer,
  sidebar,
  sidebarWidth = 'w-48',
  sidebarRight,
  sidebarRightWidth = 'w-48',
  bodyScroll = true,
  bodyClassName,
  className,
}: PanelShellProps) {
  return (
    <div className={clsx('h-full w-full flex flex-col min-h-0', className)}>
      {header && <div className="shrink-0">{header}</div>}

      <div className="flex-1 min-h-0 flex">
        {sidebar && <SidebarSlot width={sidebarWidth}>{sidebar}</SidebarSlot>}

        <div
          className={clsx(
            'flex-1 min-w-0 min-h-0',
            bodyScroll ? 'overflow-y-auto' : 'overflow-hidden',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {sidebarRight && <SidebarSlot width={sidebarRightWidth}>{sidebarRight}</SidebarSlot>}
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}
