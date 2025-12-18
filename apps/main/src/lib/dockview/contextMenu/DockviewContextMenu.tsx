/**
 * Dockview Context Menu Component
 *
 * Renders context menu at cursor position based on menu action registry.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@lib/icons';
import { useContextMenu } from './ContextMenuProvider';
import type { MenuItem } from './types';

/**
 * Context Menu Portal
 *
 * Renders the context menu as a portal when active.
 * Auto-positioned at cursor with viewport boundary detection.
 */
export function ContextMenuPortal() {
  const { state, hideContextMenu, registry } = useContextMenu();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!state.isOpen || !state.context) return;

    // Calculate position with viewport boundary detection
    const { x, y } = state.context.position;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Estimate menu size (will adjust after render)
    const estimatedMenuWidth = 250;
    const estimatedMenuHeight = 400;

    let finalX = x;
    let finalY = y;

    // Adjust if menu would overflow right edge
    if (x + estimatedMenuWidth > viewportWidth) {
      finalX = viewportWidth - estimatedMenuWidth - 10;
    }

    // Adjust if menu would overflow bottom edge
    if (y + estimatedMenuHeight > viewportHeight) {
      finalY = viewportHeight - estimatedMenuHeight - 10;
    }

    setPosition({ x: Math.max(10, finalX), y: Math.max(10, finalY) });
  }, [state.isOpen, state.context]);

  // Close on escape key
  useEffect(() => {
    if (!state.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, hideContextMenu]);

  // Close on click outside
  useEffect(() => {
    if (!state.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };

    // Delay to avoid immediate close from the context menu trigger
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [state.isOpen, hideContextMenu]);

  if (!state.isOpen || !state.context) return null;

  // Convert registry actions to menu items
  const items = registry.toMenuItems(state.context.contextType, state.context);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="min-w-[200px] max-w-[300px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl py-1">
        {items.map(item => (
          <MenuItemComponent
            key={item.id}
            item={item}
            onClose={hideContextMenu}
          />
        ))}
        {items.length === 0 && (
          <div className="px-3 py-2 text-sm text-neutral-500 text-center">
            No actions available
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

interface MenuItemComponentProps {
  item: MenuItem;
  onClose: () => void;
  depth?: number;
}

/**
 * Recursive menu item component
 * Supports nested menus and various item types
 */
function MenuItemComponent({ item, onClose, depth = 0 }: MenuItemComponentProps) {
  const [showChildren, setShowChildren] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  const hasChildren = item.children && item.children.length > 0;
  const isDisabled = !!item.disabled;

  const handleClick = () => {
    if (isDisabled) return;

    if (hasChildren) {
      setShowChildren(!showChildren);
    } else {
      item.onClick?.();
      onClose();
    }
  };

  // Variant styles
  const variantClasses = {
    default: 'hover:bg-neutral-100 dark:hover:bg-neutral-700',
    danger: 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400',
    success: 'hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400',
  };

  const variant = item.variant || 'default';

  return (
    <>
      <div
        ref={itemRef}
        className={`
          flex items-center justify-between px-3 py-1.5 cursor-pointer text-sm
          ${variantClasses[variant]}
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2 flex-1">
          {item.icon && (
            <Icon
              name={item.icon as any}
              size={14}
              className={item.iconColor || 'text-current'}
            />
          )}
          <span>{item.label}</span>
        </div>

        <div className="flex items-center gap-2">
          {item.shortcut && (
            <span className="text-xs text-neutral-400">{item.shortcut}</span>
          )}
          {hasChildren && (
            <Icon name="chevronRight" size={12} className="text-neutral-400" />
          )}
        </div>
      </div>

      {item.divider && (
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />
      )}

      {/* Nested children */}
      {hasChildren && showChildren && item.children!.map(child => (
        <MenuItemComponent
          key={child.id}
          item={child}
          onClose={onClose}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
