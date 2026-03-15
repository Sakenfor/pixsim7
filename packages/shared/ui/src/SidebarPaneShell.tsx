import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSidebarCollapse } from './hooks/useSidebarCollapse';

export const SIDEBAR_WIDTHS = { narrow: 144, default: 192, wide: 224 } as const;

const COLLAPSED_WIDTH = 32;

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
  /** Enable collapse toggle. Default: false. */
  collapsible?: boolean;
  /** Width in px when expanded (used when collapsible=true, replaces widthClassName). Default: 192. */
  expandedWidth?: number;
  /** localStorage persistence key for collapse state. */
  persistKey?: string;
  /** Initial collapsed state. Default: false. */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state. */
  collapsed?: boolean;
  /** Callback when collapsed state changes. */
  onCollapsedChange?: (v: boolean) => void;
  /**
   * When true, hide the title when the sidebar is inside a container
   * that already shows a title (floating panel or visible dockview tab bar).
   */
  autoHideTitle?: boolean;
  /** Enable detach/dock-back support. Shows a pop-out button in the header. */
  detachable?: {
    /** Whether the sidebar is currently detached. */
    detached: boolean;
    /** Called when user clicks the detach (pop-out) button. */
    onDetach: () => void;
    /** Called when user clicks the dock-back button on the collapsed rail. */
    onDockBack: () => void;
  };
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
  collapsible = false,
  expandedWidth = SIDEBAR_WIDTHS.default,
  persistKey,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  autoHideTitle = true,
  detachable,
}: SidebarPaneShellProps) {
  const internal = useSidebarCollapse(persistKey, defaultCollapsed);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hasExternalTitle, setHasExternalTitle] = useState(false);

  useEffect(() => {
    if (!autoHideTitle) return;
    const el = rootRef.current;
    if (!el) return;

    // Check for floating panel ancestor
    if (el.closest('.floating-panel')) {
      setHasExternalTitle(true);
      return;
    }

    // Check for visible dockview tab bar
    const group = el.closest('.dv-groupview') as HTMLElement | null;
    if (!group) return;

    const check = () => setHasExternalTitle(!group.classList.contains('dv-tabs-hidden'));
    check();

    const observer = new MutationObserver(check);
    observer.observe(group, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [autoHideTitle]);
  const isControlled = controlledCollapsed !== undefined;
  const isDetached = detachable?.detached ?? false;
  const collapsed = isDetached
    ? true
    : collapsible
      ? (isControlled ? controlledCollapsed : internal.collapsed)
      : false;

  const handleToggle = () => {
    const next = !collapsed;
    if (isControlled) {
      onCollapsedChange?.(next);
    } else {
      internal.setCollapsed(next);
      onCollapsedChange?.(next);
    }
  };

  const borderClass =
    variant === 'light' ? 'border-neutral-200 dark:border-neutral-800' : 'border-neutral-800';
  const titleClass =
    variant === 'light'
      ? 'text-sm font-semibold text-neutral-800 dark:text-neutral-100'
      : 'text-sm font-semibold text-neutral-200';

  const widthStyle = collapsible
    ? { width: collapsed ? COLLAPSED_WIDTH : expandedWidth }
    : undefined;

  const effectiveTitle = autoHideTitle && hasExternalTitle ? undefined : title;

  return (
    <div
      ref={rootRef}
      className={clsx(
        !collapsible && widthClassName,
        'flex shrink-0 flex-col border-r relative',
        collapsible && 'transition-[width] duration-200 ease-in-out',
        borderClass,
        className,
      )}
      style={widthStyle}
    >
      {collapsed ? (
        /* Collapsed rail */
        <div className="flex h-full flex-col items-center pt-2 gap-1">
          {isDetached ? (
            <button
              type="button"
              onClick={detachable!.onDockBack}
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded',
                'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
                'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                'transition-colors',
              )}
              aria-label="Dock sidebar back"
            >
              <DockBackIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              className={clsx(
                'flex h-6 w-6 items-center justify-center rounded',
                'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
                'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                'transition-colors',
              )}
              aria-label="Expand sidebar"
            >
              <ChevronRight />
            </button>
          )}
        </div>
      ) : (
        <>
          {effectiveTitle ? (
            <div className={clsx('flex shrink-0 items-center border-b px-3 py-3', borderClass, headerClassName)}>
              <h1 className={clsx(titleClass, 'flex-1 min-w-0')}>{effectiveTitle}</h1>
              {(collapsible || detachable) && (
                <div className="ml-1 flex shrink-0 items-center gap-0.5">
                  {detachable && (
                    <button
                      type="button"
                      onClick={detachable.onDetach}
                      className={clsx(
                        'flex h-5 w-5 items-center justify-center rounded',
                        'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                        'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                        'transition-colors',
                      )}
                      aria-label="Pop out sidebar"
                    >
                      <PopOutIcon />
                    </button>
                  )}
                  {collapsible && (
                    <button
                      type="button"
                      onClick={handleToggle}
                      className={clsx(
                        'flex h-5 w-5 items-center justify-center rounded',
                        'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                        'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                        'transition-colors',
                      )}
                      aria-label="Collapse sidebar"
                    >
                      <ChevronLeft />
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (collapsible || detachable) ? (
            hasExternalTitle ? (
              /* Title hidden by autoHideTitle — overlay collapse button on content */
              <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                {detachable && (
                  <button
                    type="button"
                    onClick={detachable.onDetach}
                    className={clsx(
                      'flex h-5 w-5 items-center justify-center rounded',
                      'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      'transition-colors',
                    )}
                    aria-label="Pop out sidebar"
                  >
                    <PopOutIcon />
                  </button>
                )}
                {collapsible && (
                  <button
                    type="button"
                    onClick={handleToggle}
                    className={clsx(
                      'flex h-5 w-5 items-center justify-center rounded',
                      'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      'transition-colors',
                    )}
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft />
                  </button>
                )}
              </div>
            ) : (
              <div className={clsx('flex shrink-0 justify-end gap-0.5 border-b px-2 py-2', borderClass, headerClassName)}>
                {detachable && (
                  <button
                    type="button"
                    onClick={detachable.onDetach}
                    className={clsx(
                      'flex h-5 w-5 items-center justify-center rounded',
                      'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      'transition-colors',
                    )}
                    aria-label="Pop out sidebar"
                  >
                    <PopOutIcon />
                  </button>
                )}
                {collapsible && (
                  <button
                    type="button"
                    onClick={handleToggle}
                    className={clsx(
                      'flex h-5 w-5 items-center justify-center rounded',
                      'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300',
                      'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      'transition-colors',
                    )}
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft />
                  </button>
                )}
              </div>
            )
          ) : null}
          <div className={clsx('min-h-0 flex-1', bodyScrollable ? 'overflow-y-auto p-2' : 'overflow-hidden', bodyClassName)}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/** Pop-out / external-link style icon */
function PopOutIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** Dock-back / import icon (arrow pointing into a box) */
function DockBackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
