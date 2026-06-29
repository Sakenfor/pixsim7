import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/**
 * Dropdown — canonical dropdown/popover menu component.
 * REUSE this component for any dropdown menu across the app.
 *
 * Usage:
 * <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)}>
 *   <DropdownItem onClick={handleAction}>Action 1</DropdownItem>
 *   <DropdownItem onClick={handleAction}>Action 2</DropdownItem>
 *   <DropdownDivider />
 *   <DropdownItem onClick={handleAction}>Delete</DropdownItem>
 * </Dropdown>
 */

const HIDDEN_SCROLLBAR_CLASS = 'pixsim-dropdown-scrollbar-hidden';
const HIDDEN_SCROLLBAR_STYLE_ID = 'pixsim-dropdown-scrollbar-style';
const SCROLL_EPSILON = 2;

function ensureHiddenScrollbarStyle() {
  if (typeof document === 'undefined' || document.getElementById(HIDDEN_SCROLLBAR_STYLE_ID)) {
    return;
  }

  const styleEl = document.createElement('style');
  styleEl.id = HIDDEN_SCROLLBAR_STYLE_ID;
  styleEl.textContent = `
.${HIDDEN_SCROLLBAR_CLASS} {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.${HIDDEN_SCROLLBAR_CLASS}::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
`;
  document.head.appendChild(styleEl);
}

export interface DropdownProps {
  /**
   * Whether the dropdown is open
   */
  isOpen: boolean;
  /**
   * Callback when the dropdown should close (e.g., click outside)
   */
  onClose: () => void;
  /**
   * The dropdown menu items
   */
  children: React.ReactNode;
  /**
   * Position relative to trigger
   */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  /**
   * Positioning mode for the dropdown
   */
  positionMode?: 'absolute' | 'fixed' | 'static';
  /**
   * Anchor position for fixed mode
   */
  anchorPosition?: { x: number; y: number };
  /**
   * Minimum width of the dropdown
   */
  minWidth?: string;
  /**
   * Close when clicking outside (default true)
   */
  closeOnOutsideClick?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Inline styles for layout constraints such as viewport-capped menus.
   */
  style?: React.CSSProperties;
  /**
   * Additional classes for the scrollable content viewport.
   */
  scrollViewportClassName?: string;
  /**
   * Inline styles for the scrollable content viewport.
   */
  scrollViewportStyle?: React.CSSProperties;
  /**
   * Hide native scrollbars in the scrollable viewport.
   */
  hideScrollbar?: boolean;
  /**
   * Show top/bottom chevrons when the scrollable viewport has hidden overflow.
   */
  scrollIndicators?: boolean;
  /**
   * When true, render the dropdown into a portal on document.body
   * so it escapes overflow: hidden containers.
   */
  portal?: boolean;
  /**
   * Ref to the trigger element — excluded from click-outside detection
   * so toggling the trigger doesn't immediately re-close the portal'd dropdown.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function Dropdown({
  isOpen,
  onClose,
  children,
  position = 'bottom-left',
  positionMode = 'absolute',
  anchorPosition,
  minWidth = '150px',
  closeOnOutsideClick = true,
  className,
  style,
  scrollViewportClassName,
  scrollViewportStyle,
  hideScrollbar = false,
  scrollIndicators = false,
  portal = false,
  triggerRef,
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ up: false, down: false });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const updateScrollState = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    const next = {
      up: viewport.scrollTop > SCROLL_EPSILON,
      down: maxScrollTop - viewport.scrollTop > SCROLL_EPSILON,
    };

    setScrollState((prev) => (
      prev.up === next.up && prev.down === next.down ? prev : next
    ));
  }, []);

  useLayoutEffect(() => {
    if (!(hideScrollbar || scrollIndicators)) return;
    ensureHiddenScrollbarStyle();
  }, [hideScrollbar, scrollIndicators]);

  useLayoutEffect(() => {
    if (!isOpen || !scrollIndicators) {
      setScrollState({ up: false, down: false });
      return;
    }

    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    updateScrollState();
    const deferredUpdate = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(updateScrollState)
      : window.setTimeout(updateScrollState, 0);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateScrollState)
      : null;

    resizeObserver?.observe(viewport);
    window.addEventListener('resize', updateScrollState);

    return () => {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(deferredUpdate);
      } else {
        window.clearTimeout(deferredUpdate);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [children, isOpen, scrollIndicators, updateScrollState]);

  // Reflect open state on the trigger for assistive tech.
  useEffect(() => {
    const trigger = triggerRef?.current;
    if (!trigger) return;
    if (!trigger.hasAttribute('aria-haspopup')) trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }, [isOpen, triggerRef]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        !(triggerRef?.current && triggerRef.current.contains(target))
      ) {
        onCloseRef.current();
      }
    };

    // Add a small delay to prevent immediate close when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeOnOutsideClick, triggerRef]);

  // Move focus to the first item on open, restore to trigger on close.
  useEffect(() => {
    if (!isOpen) return;
    const root = dropdownRef.current;
    if (!root) return;
    const items = root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
    items[0]?.focus();
    return () => {
      triggerRef?.current?.focus();
    };
  }, [isOpen, triggerRef]);

  // Keyboard navigation: Arrow keys move focus between items, Escape closes,
  // Home/End jump to first/last.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = dropdownRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(currentIndex + 1 + items.length) % items.length].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length].focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0].focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        break;
      case 'Tab':
        // Tab dismisses the menu and lets focus move naturally.
        onCloseRef.current();
        break;
    }
  };

  if (!isOpen) return null;

  const positionClasses = {
    'bottom-left': 'top-full left-0 mt-1',
    'bottom-right': 'top-full right-0 mt-1',
    'top-left': 'bottom-full left-0 mb-1',
    'top-right': 'bottom-full right-0 mb-1',
  };

  const modeClass =
    positionMode === 'fixed' ? 'fixed' : positionMode === 'static' ? 'static' : 'absolute';

  const positionClass =
    positionMode === 'absolute' ? positionClasses[position] : undefined;

  const dropdown = (
    <div
      ref={dropdownRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={clsx(
        'bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-dropdown',
        scrollIndicators && 'relative overflow-hidden',
        modeClass,
        positionClass,
        className
      )}
      style={{
        minWidth,
        left: positionMode === 'fixed' ? anchorPosition?.x : undefined,
        top: positionMode === 'fixed' ? anchorPosition?.y : undefined,
        ...style,
      }}
    >
      <div
        ref={scrollViewportRef}
        onScroll={scrollIndicators ? updateScrollState : undefined}
        className={clsx(
          'p-2 space-y-1',
          (hideScrollbar || scrollIndicators) && HIDDEN_SCROLLBAR_CLASS,
          scrollViewportClassName,
        )}
        style={scrollViewportStyle}
      >
        {children}
      </div>
      {scrollIndicators && (
        <>
          <DropdownScrollIndicator edge="top" visible={scrollState.up} />
          <DropdownScrollIndicator edge="bottom" visible={scrollState.down} />
        </>
      )}
    </div>
  );

  if (portal) {
    return createPortal(dropdown, document.body);
  }

  return dropdown;
}

function DropdownScrollIndicator({
  edge,
  visible,
}: {
  edge: 'top' | 'bottom';
  visible: boolean;
}) {
  const isTop = edge === 'top';

  return (
    <div
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute inset-x-0 z-20 flex justify-center transition-opacity duration-150',
        isTop ? 'top-1' : 'bottom-1',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span className="flex h-4 min-w-7 items-center justify-center rounded-full bg-white/95 text-neutral-500 shadow-sm ring-1 ring-neutral-200/90 dark:bg-neutral-800/95 dark:text-neutral-300 dark:ring-neutral-700/90">
        <svg
          className="h-3 w-3"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={isTop ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
        </svg>
      </span>
    </div>
  );
}

/**
 * DropdownItem — individual menu item in a dropdown
 */
export interface DropdownItemProps {
  /**
   * Click handler
   */
  onClick?: () => void;
  /**
   * Whether the item is disabled
   */
  disabled?: boolean;
  /**
   * Icon to display before the text (React node)
   */
  icon?: React.ReactNode;
  /**
   * Content of the item
   */
  children: React.ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Visual variant
   */
  variant?: 'default' | 'danger' | 'primary' | 'success';
  /**
   * Optional right-side content (shortcut, chevron, etc.)
   */
  rightSlot?: React.ReactNode;
}

export function DropdownItem({
  onClick,
  disabled = false,
  icon,
  children,
  className,
  variant = 'default',
  rightSlot,
}: DropdownItemProps) {
  const variantClasses = {
    default: 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
    danger: 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
    primary: 'text-accent hover:bg-accent-subtle/50 dark:hover:bg-accent-subtle/20',
    success: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
  };

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2 focus:outline-none focus:ring-1 focus:ring-accent',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : variantClasses[variant],
        className
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="flex-1">{children}</span>
      {rightSlot && <span className="flex items-center gap-1 text-[10px] text-neutral-400">{rightSlot}</span>}
    </button>
  );
}

/**
 * DropdownDivider — divider between dropdown items
 */
export function DropdownDivider() {
  return <div role="separator" className="border-t dark:border-neutral-700 my-1" />;
}

/**
 * DropdownSectionHeader — small uppercase label for grouping dropdown items.
 *
 * Usage:
 * <DropdownSectionHeader>Strategy</DropdownSectionHeader>
 * <DropdownItem .../>
 */
export function DropdownSectionHeader({
  children,
  className,
  first,
}: {
  children: React.ReactNode;
  className?: string;
  /** True for the first header in the dropdown (extra top padding). */
  first?: boolean;
}) {
  return (
    <div
      className={clsx(
        'px-2 pb-0.5 text-[9px] font-semibold text-neutral-400 uppercase tracking-wider select-none',
        first ? 'pt-1.5' : 'pt-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
