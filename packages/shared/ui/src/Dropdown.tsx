import React, { useEffect, useRef } from 'react';
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
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
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
  }, [isOpen, onClose]);

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

  return (
    <div
      ref={dropdownRef}
      className={clsx(
        'bg-white dark:bg-neutral-800 border dark:border-neutral-700 rounded shadow-lg z-dropdown',
        modeClass,
        positionClass,
        className
      )}
      style={{
        minWidth,
        left: positionMode === 'fixed' ? anchorPosition?.x : undefined,
        top: positionMode === 'fixed' ? anchorPosition?.y : undefined,
      }}
    >
      <div className="p-2 space-y-1">{children}</div>
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
    primary: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
    success: 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2',
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
  return <div className="border-t dark:border-neutral-700 my-1" />;
}
